import Guacamole from "@jumpserver/guacamole";
import { afterEach, describe, expect, it, vi } from "vitest";

function deferredBitmap() {
  let resolve!: (bitmap: ImageBitmap) => void;
  const promise = new Promise<ImageBitmap>((resolved) => {
    resolve = resolved;
  });
  return { promise, resolve };
}

// JumpServer: exercise real canvas pixels and ImageBitmap disposal in the browser.
describe.skipIf(typeof document === "undefined")("Guacamole.Display bitmap lifecycle", () => {
  const bitmaps: ImageBitmap[] = [];
  const displays: Guacamole.Display[] = [];

  async function createBitmap(color: string) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const bitmap = await window.createImageBitmap(canvas);
    bitmaps.push(bitmap);
    vi.spyOn(bitmap, "close");
    return bitmap;
  }

  function createDisplay() {
    const display = new Guacamole.Display();
    displays.push(display);
    const layer = display.getDefaultLayer();
    display.resize(layer, 1, 1);
    return { display, layer };
  }

  function pixel(layer: Guacamole.Display.VisibleLayer) {
    return Array.from(layer.getCanvas().getContext("2d")!.getImageData(0, 0, 1, 1).data);
  }

  function png() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "red";
    context.fillRect(0, 0, 1, 1);
    const url = canvas.toDataURL("image/png");
    canvas.width = canvas.height = 0;
    return url;
  }

  function trackImages() {
    const NativeImage = window.Image;
    const images: HTMLImageElement[] = [];
    function TrackedImage() {
      const image = new NativeImage();
      images.push(image);
      return image;
    }
    vi.stubGlobal("Image", TrackedImage);
    return images;
  }

  function expectReleased(image: HTMLImageElement) {
    expect(image.getAttribute("src")).toBeNull();
    expect(image.onload).toBeNull();
    expect(image.onerror).toBeNull();
  }

  afterEach(() => {
    for (const display of displays.splice(0)) display.cancel();
    for (const bitmap of bitmaps.splice(0)) {
      if (bitmap.width) bitmap.close();
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("draws in task order and closes each bitmap only after drawing", async () => {
    const red = await createBitmap("red");
    const green = await createBitmap("lime");
    const first = deferredBitmap();
    const second = deferredBitmap();
    vi.spyOn(window, "createImageBitmap").mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { display, layer } = createDisplay();
    const draw = vi.spyOn(layer, "drawImage");
    const flushed = vi.fn();
    display.drawBlob(layer, 0, 0, new Blob());
    display.drawBlob(layer, 0, 0, new Blob());
    display.flush(flushed);

    second.resolve(green);
    await Promise.resolve();
    expect(flushed).not.toHaveBeenCalled();
    expect(green.close).not.toHaveBeenCalled();

    first.resolve(red);
    await Promise.resolve();
    expect(draw.mock.calls.map(([, , image]) => image)).toEqual([red, green]);
    expect(pixel(layer)).toEqual([0, 255, 0, 255]);
    expect(flushed).toHaveBeenCalledOnce();
    expect(red.close).toHaveBeenCalledOnce();
    expect(green.close).toHaveBeenCalledOnce();
  });

  it.each([false, true])("releases cancelled images before or after decoding (decoded=%s)", async (decoded) => {
    const red = await createBitmap("red");
    const green = await createBitmap("lime");
    const first = deferredBitmap();
    const second = deferredBitmap();
    vi.spyOn(window, "createImageBitmap").mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { display, layer } = createDisplay();
    const draw = vi.spyOn(layer, "drawImage");
    const flushed = vi.fn();
    display.drawBlob(layer, 0, 0, new Blob());
    display.drawBlob(layer, 0, 0, new Blob());
    display.flush(flushed);

    if (decoded) {
      first.resolve(red);
      await Promise.resolve();
      expect(red.close).not.toHaveBeenCalled();
    }
    display.cancel();
    expect(red.close).toHaveBeenCalledTimes(decoded ? 1 : 0);
    if (!decoded) first.resolve(red);
    second.resolve(green);
    await Promise.resolve();
    expect(draw).not.toHaveBeenCalled();
    expect(flushed).not.toHaveBeenCalled();
    expect(red.close).toHaveBeenCalledOnce();
    expect(green.close).toHaveBeenCalledOnce();
  });

  it("does not block following frames when decoding rejects", async () => {
    const green = await createBitmap("lime");
    vi.spyOn(window, "createImageBitmap")
      .mockRejectedValueOnce(new Error("Image decoding failed"))
      .mockResolvedValueOnce(green);
    const { display, layer } = createDisplay();
    const firstFlushed = vi.fn();
    const nextFlushed = vi.fn();
    display.drawBlob(layer, 0, 0, new Blob());
    display.flush(firstFlushed);
    display.drawBlob(layer, 0, 0, new Blob());
    display.flush(nextFlushed);

    await Promise.resolve();
    expect(firstFlushed).toHaveBeenCalledOnce();
    expect(nextFlushed).toHaveBeenCalledOnce();
    expect(pixel(layer)).toEqual([0, 255, 0, 255]);
    expect(green.close).toHaveBeenCalledOnce();
  });

  it.each([false, true])("releases successful and failed images without changing pixels (blob=%s)", async (blob) => {
    const images = trackImages();
    if (blob) vi.stubGlobal("createImageBitmap", undefined);
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const { display, layer } = createDisplay();
    for (const url of [png(), "data:image/png;base64,bm90LWEtcG5n"]) {
      if (blob) display.drawBlob(layer, 0, 0, await (await fetch(url)).blob());
      else display.draw(layer, 0, 0, url);
      await new Promise<void>((resolve) => display.flush(resolve));
      expect(pixel(layer)).toEqual([255, 0, 0, 255]);
      expectReleased(images.at(-1)!);
    }
    expect(revoke).toHaveBeenCalledTimes(blob ? 2 : 0);
  });

  it.each([false, true])("releases cancelled legacy images without late drawing (decoded=%s)", async (decoded) => {
    const images = trackImages();
    const { display, layer } = createDisplay();
    const draw = vi.spyOn(layer, "drawImage");
    display.draw(layer, 0, 0, png());
    const image = images[0]!;
    const loaded = image.onload!;
    if (decoded) await image.decode();
    display.cancel();
    expectReleased(image);
    loaded.call(image, new Event("load"));
    display.flush(() => {});
    expect(draw).not.toHaveBeenCalled();
  });

  it.each([false, true])("revokes cancelled fallback Blob URLs (decoded=%s)", async (decoded) => {
    const images = trackImages();
    vi.stubGlobal("createImageBitmap", undefined);
    const blob = await (await fetch(png())).blob();
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const { display, layer } = createDisplay();
    const draw = vi.spyOn(layer, "drawImage");
    display.drawBlob(layer, 0, 0, blob);
    const image = images[0]!;
    const url = image.src;
    const loaded = image.onload!;
    if (decoded) await image.decode();
    display.cancel();
    expectReleased(image);
    expect(revoke).toHaveBeenCalledExactlyOnceWith(url);
    loaded.call(image, new Event("load"));
    display.flush(() => {});
    expect(draw).not.toHaveBeenCalled();
  });

  it("releases snapshot canvas copies while preserving the live layer and restored pixels", async () => {
    const images = trackImages();
    const tunnel = new Guacamole.Tunnel();
    const client = new Guacamole.Client(tunnel);
    const display = client.getDisplay();
    displays.push(display);
    tunnel.oninstruction!("size", ["0", "1", "1"]);
    tunnel.oninstruction!("size", ["-1", "0", "0"]);
    tunnel.oninstruction!("png", ["12", "0", "0", "0", png().split(",")[1]!]);
    await new Promise<void>((resolve) => display.flush(resolve));
    const layer = display.getDefaultLayer();
    const liveCanvas = layer.getCanvas();
    const context = liveCanvas.getContext("2d")!;
    context.save();
    context.translate(2, 3);
    const copy = vi.spyOn(layer, "toCanvas");
    const state = await new Promise<Guacamole.Client.ExportedState>((resolve) => client.exportState(resolve));
    expect(copy).toHaveBeenCalledOnce();
    expect(copy.mock.results[0]!.value.width).toBe(0);
    expect(copy.mock.results[0]!.value.height).toBe(0);
    expect(liveCanvas.width).toBeGreaterThan(0);
    expect([context.getTransform().e, context.getTransform().f]).toEqual([2, 3]);
    context.restore();
    expect(pixel(layer)).toEqual([255, 0, 0, 255]);
    expect(state.layers["-1"]?.url).toBeUndefined();
    liveCanvas.getContext("2d")!.clearRect(0, 0, 1, 1);
    await new Promise<void>((resolve) => client.importState(state, resolve));
    expect(pixel(layer)).toEqual([255, 0, 0, 255]);
    for (const image of images) expectReleased(image);
  });

  it("releases the temporary snapshot canvas if PNG encoding fails", () => {
    const tunnel = new Guacamole.Tunnel();
    const client = new Guacamole.Client(tunnel);
    const display = client.getDisplay();
    displays.push(display);
    tunnel.oninstruction!("size", ["0", "1", "1"]);
    const layer = display.getDefaultLayer();
    const copy = vi.spyOn(layer, "toCanvas");
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementationOnce(() => {
      throw new Error("Encoding failed");
    });
    expect(() => client.exportState(() => {})).toThrow("Encoding failed");
    expect(copy.mock.results[0]!.value.width).toBe(0);
    expect(copy.mock.results[0]!.value.height).toBe(0);
    expect(layer.getCanvas().width).toBeGreaterThan(0);
  });
});
