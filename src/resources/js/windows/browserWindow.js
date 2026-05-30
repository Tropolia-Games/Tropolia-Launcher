"use strict";

const { BrowserWindow } = require("electron");

let browserWindow = null;

function getWindow() {
  return browserWindow;
}

function destroyWindow() {
  if (isReady()) {
    browserWindow.close();
    browserWindow = null;
  }
}

function createWindow(width, height) {
  destroyWindow();

  browserWindow = new BrowserWindow({
    width: width,
    height: height,
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

  browserWindow.webContents.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  );

  browserWindow.webContents.setWindowOpenHandler(({ url }) => {
    browserWindow.webContents.loadURL(url);
    return { action: "deny" };
  });

  browserWindow.on("closed", () => {
    browserWindow = null;
  });
}

function isReady() {
  return browserWindow !== null && !browserWindow.isDestroyed();
}

module.exports = { getWindow, createWindow, destroyWindow, isReady };
