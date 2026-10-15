import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS home-screen icon: icon.svg rasterized full-bleed, since iOS rounds the corners itself.
export default async function AppleIcon() {
  const svg = await readFile(join(process.cwd(), "src/app/icon.svg"), "base64");
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#111319" }}>
      <img src={`data:image/svg+xml;base64,${svg}`} width={150} height={150} alt="" />
    </div>,
    size,
  );
}
