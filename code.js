"use strict";
(() => {
  // code.ts
  figma.showUI(__html__, {
    width: 720,
    height: 640,
    title: "MockFrame",
    themeColors: false
  });
  var EXPORTABLE_TYPES = /* @__PURE__ */ new Set([
    "FRAME",
    "COMPONENT",
    "COMPONENT_SET",
    "GROUP",
    "INSTANCE",
    "RECTANGLE",
    "ELLIPSE",
    "POLYGON",
    "STAR",
    "VECTOR",
    "TEXT",
    "BOOLEAN_OPERATION",
    "SECTION"
  ]);
  figma.ui.onmessage = async (msg) => {
    if (msg.type === "GET_SELECTED_FRAME") {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        const reply = { type: "NO_SELECTION" };
        figma.ui.postMessage(reply);
        return;
      }
      if (selection.length > 1) {
        const reply = {
          type: "INVALID_SELECTION",
          reason: "Please select exactly one frame or layer."
        };
        figma.ui.postMessage(reply);
        return;
      }
      const node = selection[0];
      if (!EXPORTABLE_TYPES.has(node.type)) {
        const reply = {
          type: "INVALID_SELECTION",
          reason: "Selected layer type cannot be exported. Please select a frame, component, or shape."
        };
        figma.ui.postMessage(reply);
        return;
      }
      try {
        const bytes = await node.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: 2 }
        });
        let width = 400;
        let height = 800;
        if ("width" in node && "height" in node) {
          width = Math.round(node.width);
          height = Math.round(node.height);
        }
        const reply = {
          type: "FRAME_DATA",
          data: Array.from(bytes),
          width,
          height,
          name: node.name
        };
        figma.ui.postMessage(reply);
      } catch (err) {
        console.error("[MockFrame] Export error:", err);
        const reply = {
          type: "INVALID_SELECTION",
          reason: "Failed to export the selected layer. Please try again."
        };
        figma.ui.postMessage(reply);
      }
      return;
    }
    if (msg.type === "INSERT_MOCKUP") {
      try {
        if (!Array.isArray(msg.data) || msg.data.length === 0) {
          throw new Error("Invalid image data received.");
        }
        const safeName = typeof msg.name === "string" && msg.name.trim().length > 0 ? msg.name.trim().slice(0, 100) : "MockFrame";
        const imageBytes = new Uint8Array(msg.data);
        const image = figma.createImage(imageBytes);
        const { width, height } = await image.getSizeAsync();
        const maxDim = 1200;
        let newW = width;
        let newH = height;
        if (width > maxDim || height > maxDim) {
          const ratio = width / height;
          if (ratio > 1) {
            newW = maxDim;
            newH = Math.round(maxDim / ratio);
          } else {
            newH = maxDim;
            newW = Math.round(maxDim * ratio);
          }
        }
        const frame = figma.createFrame();
        frame.name = `${safeName} \u2014 Mockup`;
        frame.resize(newW, newH);
        frame.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FIT" }];
        frame.clipsContent = false;
        frame.x = Math.round(figma.viewport.center.x - newW / 2);
        frame.y = Math.round(figma.viewport.center.y - newH / 2);
        figma.currentPage.appendChild(frame);
        figma.currentPage.selection = [frame];
        figma.viewport.scrollAndZoomIntoView([frame]);
        figma.notify("\u2728 Mockup inserted successfully!");
        const reply = { type: "INSERT_SUCCESS" };
        figma.ui.postMessage(reply);
      } catch (err) {
        console.error("[MockFrame] Insert mockup error:", err);
        const reply = {
          type: "INSERT_ERROR",
          reason: "Failed to insert mockup into the design. Please try again."
        };
        figma.ui.postMessage(reply);
      }
      return;
    }
    if (msg.type === "RESIZE_UI") {
      const w = Math.max(400, Math.min(800, msg.width));
      const h = Math.max(500, Math.min(900, msg.height));
      figma.ui.resize(w, h);
      return;
    }
  };
})();
