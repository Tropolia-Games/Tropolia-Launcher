"use strict";

const { WebSocket } = require("ws");

function isClientReady(client) {
  return (
    client &&
    client.readyState === WebSocket.OPEN &&
    client.bufferedAmount <= 30000
  );
}

function sendFrame(client, browserWindow, dirty, image) {
  const [fw, fh] = browserWindow.getSize();

  const meta = Buffer.from(
    JSON.stringify({
      type: "frame",
      url: browserWindow.webContents.getURL(),
      x: dirty.x,
      y: dirty.y,
      w: dirty.width,
      h: dirty.height,
      fw,
      fh,
    }),
  );

  const jpeg = image.crop(dirty).toJPEG(70);

  const header = Buffer.allocUnsafe(4);
  header.writeUInt32BE(meta.length, 0);

  client.send(Buffer.concat([header, meta, jpeg]));
}

function start(browserWindow, getClient) {
  browserWindow.webContents.on("paint", (event, dirty, image) => {
    const client = getClient();

    if (!isClientReady(client)) {
      return;
    }

    try {
      sendFrame(client, browserWindow, dirty, image);
    } catch (e) {
      console.error(e.message);
    }
  });

  browserWindow.webContents.setFrameRate(30);
}

module.exports = { start };
