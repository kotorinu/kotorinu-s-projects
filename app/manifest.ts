import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "AI Work OS", short_name: "Work OS", description: "目標から今日の行動までをつなぐ", start_url: "/today",
    display: "standalone", background_color: "#f4f6fa", theme_color: "#2f6fe4", lang: "ja",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] };
}
