"use strict";

const WebSocket = require("ws");

const BrowserWindow = require("../windows/browserWindow.js");
const ScreenStreamer = require("../stream/screenStreamer.js");

let wss = null;
let wsClient = null;

function getContents() {
  return BrowserWindow.getWindow().webContents;
}

function sendMouseEvent(type, x, y) {
  getContents().sendInputEvent({
    type: type,
    x: x,
    y: y,
    button: "left",
    clickCount: 1,
  });
}

async function handleMessage(msg) {
  if (msg.type === "load") {
    if (!BrowserWindow.isReady()) {
      BrowserWindow.createWindow(msg.w, msg.h);
      ScreenStreamer.start(BrowserWindow.getWindow(), () => wsClient);
    }

    BrowserWindow.getWindow().setSize(msg.w, msg.h);
    await getContents().loadURL(msg.url);
  } else if (msg.type === "mousedown") {
    if (!BrowserWindow.isReady()) {
      return;
    }

    sendMouseEvent("mouseMove", msg.x, msg.y);
    sendMouseEvent("mouseDown", msg.x, msg.y);
  } else if (msg.type === "mouseup") {
    if (!BrowserWindow.isReady()) {
      return;
    }

    sendMouseEvent("mouseUp", msg.x, msg.y);
  } else if (msg.type === "mousemove") {
    if (!BrowserWindow.isReady()) {
      return;
    }

    getContents().sendInputEvent({
      type: "mouseMove",
      x: msg.x,
      y: msg.y,
      modifiers: msg.dragging ? ["leftButtonDown"] : [],
    });
  } else if (msg.type === "scroll") {
    if (!BrowserWindow.isReady()) {
      return;
    }

    getContents().sendInputEvent({
      type: "mouseWheel",
      x: msg.x,
      y: msg.y,
      deltaX: 0,
      deltaY: msg.delta,
      canScroll: true,
    });
  } else if (msg.type === "keydown") {
    if (!BrowserWindow.isReady()) {
      return;
    }

    getContents().sendInputEvent({ type: "keyDown", keyCode: msg.key });

    if (msg.key.length === 1) {
      getContents().sendInputEvent({ type: "char", keyCode: msg.key });
    }

    getContents().sendInputEvent({ type: "keyUp", keyCode: msg.key });
  } else if (msg.type === "back") {
    if (!BrowserWindow.isReady()) {
      return;
    }

    if (getContents().canGoBack()) {
      getContents().goBack();
    }
  } else if (msg.type === "reload") {
    if (!BrowserWindow.isReady()) {
      return;
    }

    getContents().reload();
  } else if (msg.type === "navigate") {
    if (!BrowserWindow.isReady()) {
      return;
    }

    await getContents().loadURL(msg.url);
  } else if (msg.type === "resize") {
    if (!BrowserWindow.isReady()) {
      return;
    }

    BrowserWindow.getWindow().setSize(msg.w, msg.h);
    getContents().invalidate();
  } else if (msg.type === "close") {
    if (!BrowserWindow.isReady()) {
      return;
    }

    getContents().loadURL("about:blank");
  }
}

let stopped = false;

function start() {
  stopped = false;
  tryStart();
}

function tryStart() {
  if (stopped) {
    return;
  }

  wss = new WebSocket.Server({ port: 7777 });

  wss.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      wss = null;
      setTimeout(tryStart, 10000);
      return;
    }

    console.error(err.message);
  });

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
  stopped = true;
  BrowserWindow.destroyWindow();

  if (wss) {
    wss.close();
  }
}

module.exports = { start, stop };
