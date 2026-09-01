export type InProgressTask = {
  id: string;
  title: string;
  summary: string;
  status: string;
  progressLabel: string;
  progress: number;
  image: string;
};

export type CompletedTask = {
  id: string;
  title: string;
  summary: string;
  date: string;
  action: string;
  fileType: "doc" | "sheet" | "slides";
};
