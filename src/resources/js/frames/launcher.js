"use strict";

/* Fix undici */
const { setTimeout, clearTimeout } = require("timers");

global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;

/* Core Modules */
const path = require("path");
const fs = require("fs");

/* Third-party Modules */
const { ipcRenderer } = require("electron");
const { Agent, interceptors, Pool } = require("undici");

/* Internal Modules */
const { Authenticator } = require("../resources/js/workers/auth-worker.js");
const authenticator = new Authenticator();

const {
  JavaDownloadTask,
  JavaExtractTask,
} = require("../resources/js/workers/java-worker.js");

/* Librairies Modules */
const {
  installLibrariesTask,
  installAssetsTask,
  installVersionTask,
  getVersionList,
} = require("@xmcl/installer");

const { launch, Version } = require("@xmcl/core");

/* HTML Fields */
const closeButton = document.querySelector(".close");
const reduceButton = document.querySelector(".reduce");

const username = document.querySelector(".username input");
const password = document.querySelector(".password input");

const playButton = document.querySelector(".play");
const settingsButton = document.querySelector(".settings");

const registerField = document.querySelector(".register");

const progressBar = document.querySelector(".progress");
const progressBarText = document.querySelector(".progress-text");

/* Registering listeners */
window.addEventListener("load", async () => {
  await loadCredentials();
});

closeButton.addEventListener("click", () => {
  ipcRenderer.send("main-window-close");
});

reduceButton.addEventListener("click", () => {
  ipcRenderer.send("main-window-minimize");
});

settingsButton.addEventListener("click", async (_) => {
  ipcRenderer.send("show-options");
});

registerField.addEventListener("click", async (_) => {
  window.open(
    "https://tropolia.fr/user/register",
    "RegisterWindow",
    "width=700,height=600"
  );
});

/* Open devTool console */
let devTool = false;

document.addEventListener("keydown", (e) => {
  if (e.keyCode == 123) {
    ipcRenderer.send(
      devTool ? "main-window-dev-tools-close" : "main-window-dev-tools"
    );
    devTool = !devTool;
  }
});
/* Open devTool console */

password.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    playButton.click();
  }
});

playButton.addEventListener("click", async (_) => {
  disableFields(true);

  if (username.value === "" || password.value === "") {
    setErrorMessage("Identifiants incorrects.");
    return disableFields(false);
  }

  let authResult = undefined;

  try {
    setMessage("Authentification en cours...");
    authResult = await authenticator.auth(username.value, password.value);

    if (authResult.error) {
      setErrorMessage("Veuillez entrer votre code 2FA.");

      const tfaResult = await ipcRenderer.invoke("require-tfa", {
        username: username.value,
        password: password.value,
      });

      if (tfaResult.message) {
        setErrorMessage(tfaResult.message);
        return disableFields(false);
      }

      try {
        authResult = await authenticator.auth(
          username.value,
          password.value,
          tfaResult.code
        );
      } catch (error) {
        setErrorMessage(error.message);
        return disableFields(false);
      }
    }

    saveCredentials();
    setMessage("Authentification réussie...");
  } catch (error) {
    setErrorMessage(error.message);
    return disableFields(false);
  }

  let javaPath = undefined;

  try {
    javaPath = await downloadJava(gamePath);
  } catch (error) {
    setErrorMessage("Impossible de vérifier Java...", error);
    return disableFields(false);
  }

  // Initialize the custom undici agent.
  agent = await createAgent();

  const options = await getOptions();
  let latestVersion = undefined;

  try {
    const preRelease = options?.prerelease ?? false;

    latestVersion = await downloadJar(gamePath, preRelease);
  } catch (error) {
    setErrorMessage("Impossible de récupérer la version...", error);
    return disableFields(false);
  }

  const resolvedVersion = await Version.parse(gamePath, latestVersion.id);

  try {
    await downloadLibrairies(resolvedVersion);
  } catch (error) {
    setErrorMessage(
      "Une erreur s'est produite lors du téléchargement...",
      error
    );
    return disableFields(false);
  }

  try {
    await downloadAssets(resolvedVersion);
  } catch (error) {
    setErrorMessage(
      "Une erreur s'est produite lors de l'installation des assets.",
      error
    );
    return disableFields(false);
  }

  await launchGame(
    {
      gamePath: gamePath,
      version: latestVersion.id,
      javaPath: javaPath,
      authResult: authResult,
    },
    options
  );
});
/* Registering listeners */

/* Workers */
async function downloadJava(gamePath) {
  setMessage("Vérification de java...");
  setProgress(0);

  // Retrieve the JRE path. If not found, download it.
  const installTask = await new JavaDownloadTask({
    gamePath: gamePath,
    java: { type: "jdk", version: 8 },
  }).startAndWait({
    onUpdate(task, chunkSize) {
      if (chunkSize > 0) {
        const percent = Math.round((task.progress / task.total) * 100);

        setMessage(`Téléchargement de java en cours... (${percent}%)`);
        setProgress(percent);
      }
    },
  });

  setMessage("Vérification de java terminé.");
  setProgress(100);

  // If it successfully finds the JRE, return the JRE path.
  if (installTask.success) {
    return installTask.path;
  }

  setMessage("Décompression de java en cours...");
  setProgress(0);

  // Extract the JRE zip file based on the download task's response.
  const extractTask = await new JavaExtractTask({
    source: installTask.source,
    destination: installTask.destination,
  }).startAndWait({
    // The update progress will only be shown for zip files.
    onUpdate(task, progress) {
      setMessage(`Décompression de java en cours... (${progress}%)`);
      setProgress(progress);
    },
  });

  setMessage("Décompression de java terminée.");
  setProgress(100);

  return extractTask;
}

async function getLatestVersion(prerelease) {
  const versions = await getVersionList({
    remote: "https://versions.tropolia.fr/manifest.json",
  });

  const latestVersion = versions.versions.find((v) => {
    const targetId = prerelease
      ? versions.latest.prerelease
      : versions.latest.release;
    return v.id === targetId;
  });

  if (!latestVersion) {
    throw new Error("Impossible de récupérer la dernière version...");
  }

  return latestVersion;
}

async function downloadJar(gamePath, prerelease) {
  const latestVersion = await getLatestVersion(prerelease);

  const installTask = installVersionTask(latestVersion, gamePath, {
    dispatcher: agent,
  });

  setMessage("Vérification de la version...");
  setProgress(0);

  await installTask.startAndWait({
    onUpdate(task, chunkSize) {
      if (chunkSize > 0) {
        const percent = Math.round(
          (installTask.progress / installTask.total) * 100
        ); // Waiting for the lib to be fixed...

        setMessage(`Récupération de la version en cours... (${percent}%)`);
        setProgress(percent);
      }
    },
  });

  setMessage("Vérification de la version terminé.");
  setProgress(100);

  return latestVersion;
}

async function downloadLibrairies(resolvedVersion) {
  const installTask = installLibrariesTask(resolvedVersion, {
    dispatcher: agent,
  });

  setMessage("Vérification des librairies...");
  setProgress(0);

  await installTask.startAndWait({
    onUpdate(task, chunkSize) {
      if (chunkSize > 0) {
        const percent = Math.round(
          (installTask.progress / installTask.total) * 100
        );

        setMessage(`Téléchargement des librairies en cours... (${percent}%)`);
        setProgress(percent);
      }
    },
  });

  setMessage("Vérification des librairies terminé.");
  setProgress(100);
}

async function downloadAssets(resolvedVersion) {
  const installTask = installAssetsTask(resolvedVersion, {
    assetsHost: "https://versions.tropolia.fr/assets/objects",
    dispatcher: agent,
  });

  setMessage("Vérification des assets...");
  setProgress(0);

  await installTask.startAndWait({
    onUpdate(task, chunkSize) {
      if (chunkSize > 0) {
        const percent = Math.round(
          (installTask.progress / installTask.total) * 100
        );

        setMessage(`Téléchargement des assets en cours... (${percent}%)`);
        setProgress(percent);
      }
    },
  });

  setMessage("Vérification des assets terminé.");
  setProgress(100);
}

async function launchGame(args, options) {
  setMessage("Lancement du jeu...");

  setProgress(0);

  await launch({
    gamePath: args.gamePath,
    javaPath: args.javaPath,
    version: args.version,
    accessToken: args.authResult.token,
    gameProfile: {
      name: args.authResult.name,
      id: args.authResult.uuid,
    },
    userType: "legacy",
    extraExecOption: {
      detached: true,
    },
    ignoreInvalidMinecraftCertificates: true,
    ignorePatchDiscrepancies: true,
    minMemory: 128,
    maxMemory: (parseInt(options?.ram, 10) || 2) * 1024,
    extraJVMArgs: [
      "-XX:+UseG1GC",
      "-XX:MaxGCPauseMillis=10",
      "-XX:G1HeapRegionSize=32m",
      "-XX:+DisableAttachMechanism",
    ],
  });

  setProgress(100);
  disableFields(false);

  ipcRenderer.send("main-window-close");
}
/* Workers */

const CREDENTIALS_FILE_NAME = "credentials.json";

/* Load Credentials from File */
async function loadCredentials() {
  const credentials = await ipcRenderer.invoke(
    "get-from-file",
    CREDENTIALS_FILE_NAME
  );

  if (credentials.username) {
    username.value = credentials.username;
  }

  if (credentials.password) {
    password.value = Buffer.from(credentials.password, "base64").toString(
      "utf-8"
    );
  }
}

/* Save Credentials to File */
function saveCredentials() {
  const datas = {
    username: username.value,
    password: Buffer.from(password.value).toString("base64"),
  };

  ipcRenderer.send("save-to-file", CREDENTIALS_FILE_NAME, datas);
}
/* Save Credentials to File */

/* Utils */
async function getOptions() {
  return await ipcRenderer.invoke("get-from-file", "options.json");
}

const gamePath = await getGamePath();

async function getGamePath() {
  return await ipcRenderer.invoke("appData");
}

function setProgress(percentage) {
  const maxWidth = 350;
  const progressBarWidth = (percentage / 100) * maxWidth;

  progressBar.style.width = progressBarWidth + "px";
}

function disableFields(state) {
  const elements = [
    username,
    password,
    playButton,
    settingsButton,
    registerField,
  ];

  elements.forEach((element) => {
    if (state) {
      element.classList.add("disabled");
    } else {
      element.classList.remove("disabled");
    }
  });
}

function setMessage(text) {
  console.log(text);
  progressBarText.innerHTML = text;
}

function setErrorMessage(text, error) {
  if (error) {
    console.log(error);
  }

  console.log(text);
  progressBarText.innerHTML = "<span style='color: red;'>" + text + "</span>";
}
/* Utils */

/* Custom undici agent (sometimes can be really aggressive) */
let agent;

async function createAgent() {
  const options = (await getOptions()) || {};
  const maxConnections = parseInt(options.maxconnections ?? 16, 10);

  return (agent = new Agent({
    headersTimeout: 45_000,
    bodyTimeout: 60_000,
    maxRedirections: 5,
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 120_000,
    factory: (origin, opts) =>
      new Pool(origin, { connections: maxConnections, ...opts }),
  }).compose(interceptors.redirect(), interceptors.retry()));
}
