import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Karakeep",
    short_name: "Karakeep",
    description:
      "The Bookmark Everything app. Hoard links, notes, and images and they will get automatically tagged AI.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/logo-16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        src: "/icons/logo-48.png",
        sizes: "48x48",
        type: "image/png",
      },
      {
        src: "/icons/logo-128.png",
        sizes: "128x128",
        type: "image/png",
      },
    ],
  };
}
