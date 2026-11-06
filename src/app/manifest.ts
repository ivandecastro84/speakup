import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Speak Up Idiomas · Portal do Aluno",
    short_name: "Speak Up",
    description: "Agende reposições, acompanhe presenças e próximas aulas.",
    lang: "pt-BR",
    start_url: "/aluno",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#08112a",
    theme_color: "#08112a",
    icons: [
      { src: "/icones/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icones/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icones/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
