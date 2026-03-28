export const MIC_INTAKE_CARD_STYLE = Object.freeze({
  sectionPrefix: "◇",
  asIsHeader: "AS-IS _",
  taskListHeader: "TASK LIST _",
  questionsHeader: "QUESTIONS _",
  readyHeader: "READY FOR DISPATCH ?",
});

export const MIC_INTAKE_PRESENTATION_SECTIONS = Object.freeze([
  MIC_INTAKE_CARD_STYLE.asIsHeader,
  MIC_INTAKE_CARD_STYLE.taskListHeader,
  MIC_INTAKE_CARD_STYLE.questionsHeader,
  MIC_INTAKE_CARD_STYLE.readyHeader,
]);

export function renderMicSectionHeader(label) {
  return `${MIC_INTAKE_CARD_STYLE.sectionPrefix} ${label}`;
}
