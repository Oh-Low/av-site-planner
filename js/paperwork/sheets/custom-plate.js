import { registerSheetType } from "../sheet-registry.js";

registerSheetType({
  id: "custom-plate",
  label: "Custom plate",
  expand() {
    return [];
  },
  defaultElements() {
    return [];
  },
});
