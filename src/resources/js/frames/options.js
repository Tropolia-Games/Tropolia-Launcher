"use strict";

const { ipcRenderer } = require("electron");

const ramSelector = document.querySelector("#memory-select");

const preRelease = document.querySelector("#enable-prerelease");
const maxconnections = document.querySelector("#max-connections");

const confirmButton = document.querySelector(".confirm-button");

/* Listeners */
document.addEventListener("DOMContentLoaded", () => {
  const maxConnectionsInput = document.getElementById("max-connections");

  maxConnectionsInput.addEventListener("input", () => {
    let value = parseInt(maxConnectionsInput.value, 10);

    if (isNaN(value)) {
      value = maxconnections.min;
    }

    maxConnectionsInput.value = Math.max(
      maxconnections.min,
      Math.min(maxconnections.max, value)
    );
  });
});

confirmButton.addEventListener("click", () => saveOptions());

window.addEventListener("load", async () => loadOptions());
/* Listeners */

const OPTIONS_FILE_NAME = "options.json";

/* Load Options from File */
async function loadOptions() {
  const options = await ipcRenderer.invoke("get-from-file", OPTIONS_FILE_NAME);

  if (options) {
    ramSelector.value = options.ram;
    preRelease.checked = options.prerelease;
    maxconnections.value = options.maxconnections ?? 16;
  }
}

/* Save Options to File */
function saveOptions() {
  const datas = {
    ram: ramSelector.value,
    prerelease: preRelease.checked,
    maxconnections: maxconnections.value,
  };

  ipcRenderer.send("save-to-file", OPTIONS_FILE_NAME, datas);
  ipcRenderer.send("hide-options");
}
