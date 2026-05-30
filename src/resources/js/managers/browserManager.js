"use strict";

const { BrowserWindow } = require("electron");
const WebSocket = require("ws");

let browserWin = null;
let wss = null;
let wsClient = null;

function startPaintStream() {
  if (!browserWin || browserWin.isDestroyed()) {
    return;
  }

  browserWin.webContents.on("paint", (event, dirty, image) => {
    if (!wsClient || wsClient.readyState !== WebSocket.OPEN) {
      return;
    }

    if (wsClient.bufferedAmount > 30000) {
      return;
    }

    try {
      const [fw, fh] = browserWin.getSize();
      wsClient.send(
        JSON.stringify({
          type: "frame",
          url: browserWin.webContents.getURL(),
          x: dirty.x,
          y: dirty.y,
          w: dirty.width,
          h: dirty.height,
          fw,
          fh,
        }),
      );
      wsClient.send(image.crop(dirty).toJPEG(70));
    } catch (e) {
      console.error(e.message);
    }
  });

  browserWin.webContents.setFrameRate(60);
}

function createBrowserWindow(w, h) {
  browserWin = new BrowserWindow({
    width: w,
    height: h,
    show: false,
    frame: false,
    skipTaskbar: true,
    resizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      offscreen: true,
    },
  });

  browserWin.webContents.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  );

  browserWin.webContents.setWindowOpenHandler(({ url }) => {
    browserWin.webContents.loadURL(url);
    return { action: "deny" };
  });

  browserWin.on("closed", () => {
    browserWin = null;
  });

  startPaintStream();
}

async function handleMessage(msg) {
  if (msg.type === "load") {
    if (!browserWin || browserWin.isDestroyed()) {
      createBrowserWindow(msg.w, msg.h);
    }

    browserWin.setSize(msg.w, msg.h);
    await browserWin.webContents.loadURL(msg.url);
  } else if (msg.type === "click") {
    if (!browserWin || browserWin.isDestroyed()) {
      return;
    }

    browserWin.webContents.sendInputEvent({
      type: "mouseMove",
      x: msg.x,
      y: msg.y,
    });
    browserWin.webContents.sendInputEvent({
      type: "mouseDown",
      x: msg.x,
      y: msg.y,
      button: "left",
      clickCount: 1,
    });
    browserWin.webContents.sendInputEvent({
      type: "mouseUp",
      x: msg.x,
      y: msg.y,
      button: "left",
      clickCount: 1,
    });
  } else if (msg.type === "scroll") {
    if (!browserWin || browserWin.isDestroyed()) {
      return;
    }

    browserWin.webContents.sendInputEvent({
      type: "mouseWheel",
      x: msg.x,
      y: msg.y,
      deltaX: 0,
      deltaY: msg.delta,
      canScroll: true,
    });
  } else if (msg.type === "keydown") {
    if (!browserWin || browserWin.isDestroyed()) {
      return;
    }

    browserWin.webContents.sendInputEvent({
      type: "keyDown",
      keyCode: msg.key,
    });

    if (msg.key.length === 1) {
      browserWin.webContents.sendInputEvent({ type: "char", keyCode: msg.key });
    }

    browserWin.webContents.sendInputEvent({ type: "keyUp", keyCode: msg.key });
  } else if (msg.type === "back") {
    if (!browserWin || browserWin.isDestroyed()) {
      return;
    }

    if (browserWin.webContents.canGoBack()) {
      browserWin.webContents.goBack();
    }
  } else if (msg.type === "reload") {
    if (!browserWin || browserWin.isDestroyed()) {
      return;
    }

    browserWin.webContents.reload();
  } else if (msg.type === "navigate") {
    if (!browserWin || browserWin.isDestroyed()) {
      return;
    }

    await browserWin.webContents.loadURL(msg.url);
  } else if (msg.type === "resize") {
    if (!browserWin || browserWin.isDestroyed()) {
      return;
    }

    browserWin.setSize(msg.w, msg.h);
    browserWin.webContents.invalidate();
  } else if (msg.type === "close") {
    if (!browserWin || browserWin.isDestroyed()) {
      return;
    }

    browserWin.webContents.loadURL("about:blank");
  }
}

function start() {
  wss = new WebSocket.Server({ port: 7777 });

  wss.on("connection", (ws) => {
    wsClient = ws;

    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data);
        await handleMessage(msg);
      } catch (e) {
        console.error(e.message);
      }
    });

    ws.on("close", () => {
      wsClient = null;
    });
  });
}

function stop() {
  if (browserWin && !browserWin.isDestroyed()) {
    browserWin.close();
  }

  if (wss) {
    wss.close();
  }
}

module.exports = { start, stop };
