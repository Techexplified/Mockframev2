// MockFrame Figma Plugin — Main Thread (code.ts)
// Handles all Figma canvas operations: exporting selected frames and inserting final mockup.
// TODO(security): Consider adding MFA / OAuth provider for future user accounts if needed.

figma.showUI(__html__, {
  width: 720,
  height: 640,
  title: "MockFrame",
  themeColors: false,
});

// ─── Message Types ─────────────────────────────────────────────────────────────

type UIMessage =
  | { type: "GET_SELECTED_FRAME" }
  | { type: "INSERT_MOCKUP"; data: number[]; name: string }
  | { type: "RESIZE_UI"; width: number; height: number };

type CodeMessage =
  | { type: "FRAME_DATA"; data: number[]; width: number; height: number; name: string }
  | { type: "NO_SELECTION" }
  | { type: "INVALID_SELECTION"; reason: string }
  | { type: "INSERT_SUCCESS" }
  | { type: "INSERT_ERROR"; reason: string };

// ─── Exportable node types ──────────────────────────────────────────────────────
const EXPORTABLE_TYPES: Set<string> = new Set([
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
  "SECTION",
]);

// ─── Message Handler ────────────────────────────────────────────────────────────

figma.ui.onmessage = async (msg: UIMessage) => {

  // ── GET_SELECTED_FRAME ──────────────────────────────────────────────────────
  // Export the selected Figma node as PNG bytes and send to UI for mockup compositing
  if (msg.type === "GET_SELECTED_FRAME") {
    const selection = figma.currentPage.selection;

    if (selection.length === 0) {
      const reply: CodeMessage = { type: "NO_SELECTION" };
      figma.ui.postMessage(reply);
      return;
    }

    if (selection.length > 1) {
      const reply: CodeMessage = {
        type: "INVALID_SELECTION",
        reason: "Please select exactly one frame or layer.",
      };
      figma.ui.postMessage(reply);
      return;
    }

    const node = selection[0];

    if (!EXPORTABLE_TYPES.has(node.type)) {
      const reply: CodeMessage = {
        type: "INVALID_SELECTION",
        reason: "Selected layer type cannot be exported. Please select a frame, component, or shape.",
      };
      figma.ui.postMessage(reply);
      return;
    }

    try {
      const bytes = await (node as SceneNode & ExportMixin).exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: 2 },
      });

      // Get dimensions from node
      let width = 400;
      let height = 800;
      if ("width" in node && "height" in node) {
        width = Math.round((node as { width: number; height: number }).width);
        height = Math.round((node as { width: number; height: number }).height);
      }

      const reply: CodeMessage = {
        type: "FRAME_DATA",
        data: Array.from(bytes),
        width,
        height,
        name: node.name,
      };
      figma.ui.postMessage(reply);
    } catch (err) {
      console.error("[MockFrame] Export error:", err);
      const reply: CodeMessage = {
        type: "INVALID_SELECTION",
        reason: "Failed to export the selected layer. Please try again.",
      };
      figma.ui.postMessage(reply);
    }
    return;
  }

  // ── INSERT_MOCKUP ──────────────────────────────────────────────────────────
  // Receive composite mockup PNG bytes from UI, create a Figma Frame with image fill
  if (msg.type === "INSERT_MOCKUP") {
    try {
      // Validate image data — security: check for valid array before processing
      if (!Array.isArray(msg.data) || msg.data.length === 0) {
        throw new Error("Invalid image data received.");
      }

      // Validate name — security: use a safe default, don't trust user string for file ops
      const safeName = (typeof msg.name === "string" && msg.name.trim().length > 0)
        ? msg.name.trim().slice(0, 100)
        : "MockFrame";

      const imageBytes = new Uint8Array(msg.data);
      const image = figma.createImage(imageBytes);

      // Get actual image dimensions from the created image
      const { width, height } = await image.getSizeAsync();

      // Scale down if too large (max 1200px)
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

      // Create a Frame with image fill
      const frame = figma.createFrame();
      frame.name = `${safeName} — Mockup`;
      frame.resize(newW, newH);
      frame.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FIT" }];
      frame.clipsContent = false;

      // Centre in viewport
      frame.x = Math.round(figma.viewport.center.x - newW / 2);
      frame.y = Math.round(figma.viewport.center.y - newH / 2);

      figma.currentPage.appendChild(frame);
      figma.currentPage.selection = [frame];
      figma.viewport.scrollAndZoomIntoView([frame]);

      figma.notify("✨ Mockup inserted successfully!");

      const reply: CodeMessage = { type: "INSERT_SUCCESS" };
      figma.ui.postMessage(reply);

    } catch (err) {
      console.error("[MockFrame] Insert mockup error:", err);
      const reply: CodeMessage = {
        type: "INSERT_ERROR",
        reason: "Failed to insert mockup into the design. Please try again.",
      };
      figma.ui.postMessage(reply);
    }
    return;
  }

  // ── RESIZE_UI ───────────────────────────────────────────────────────────────
  if (msg.type === "RESIZE_UI") {
    const w = Math.max(400, Math.min(800, msg.width));
    const h = Math.max(500, Math.min(900, msg.height));
    figma.ui.resize(w, h);
    return;
  }
};
