export const MEDIA_BUCKET = "media";

export const MEDIA_ITEMS = [
  {
    id: "vereinshymne-audio",
    title: "Im Ziel vereint",
    description: "MP3 zum Anhören während der Arbeit in RTLiga.",
    type: "audio",
    path: "verein/im-ziel-vereint.mp3",
    filename: "im-ziel-vereint.mp3",
  },
  {
    id: "vereinshymne-video",
    title: "Im Ziel vereint (max)",
    description: "MP4 als Video-Version mit Player und Download.",
    type: "video",
    path: "verein/im-ziel-vereint-max.mp4",
    filename: "im-ziel-vereint-max.mp4",
  },
];

export const MEDIA_SIGNED_URL_TTL = 60 * 60 * 8;