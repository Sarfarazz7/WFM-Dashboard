import type { SheetMapping } from "../types";

export const shrinkageMapping: SheetMapping = {
  sheetKey: "shrinkage",
  expectedSheetName: "Shrinkage",
  metricType: "shrinkage",
  columns: {
    lob: "LOB",
    totalHeadcount: "Total HC",
    scheduled: "Scheduled",
    leave: "Leave",
    present: "Present",
    shrinkageHeadcount: "Shrinkage",
    weekOff: "Week Off",
    shrinkagePercentage: "Shrinkage %",
  },
};
