import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Common Ground",
    short_name: "Common Ground",
    description:
      "A shared home for your household’s plans, chores, and little necessities.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f7f3",
    theme_color: "#f8f7f3",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    // A long press on the installed icon: straight to the box you wanted.
    shortcuts: [
      {
        name: "Add a to-do",
        url: "/?tab=To-dos&add=task",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Shopping list",
        url: "/?tab=Shopping%20list",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Wall display",
        url: "/?display=1",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    // Lets the installed app appear in the phone's share sheet, so a product
    // page goes straight onto the shopping list.
    share_target: {
      action: "/",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
