import type {
  AttendanceRecord,
  Employee,
  Equipment,
  LoadPlanRow,
  SupportAssignment,
  WorkGroup,
} from "@/lib/types";
import { computeEquipmentLoad } from "./equipmentLoad";
import { computeGroupLoad } from "./groupLoad";
import { computeIndirectOvertime, computeLineSummaries } from "./mainSummary";
import { INDIRECT_WORKER } from "./defaultGroups";

interface Args {
  employees: Employee[];
  equipment: Equipment[];
  loadPlan: LoadPlanRow[];
  attendance: AttendanceRecord[];
  workGroups: WorkGroup[];
  supportAssignments: SupportAssignment[];
}

export function computeAll(args: Args) {
  const equipResult = computeEquipmentLoad(
    args.equipment,
    args.loadPlan,
    args.workGroups
  );

  const groupLoad = computeGroupLoad({
    workGroups: args.workGroups,
    employees: args.employees,
    attendance: args.attendance,
    equipmentLoad: equipResult.rows,
  });

  const indirect = computeIndirectOvertime(
    groupLoad,
    args.attendance,
    args.employees,
    INDIRECT_WORKER
  );

  const lineSummaries = computeLineSummaries({
    employees: args.employees,
    attendance: args.attendance,
    groupLoad,
    supportAssignments: args.supportAssignments,
    indirectOvertimePeople: indirect.overtimePeople,
  });

  return {
    equipmentLoad: equipResult.rows,
    unmatchedPlanEquipment: equipResult.unmatchedPlanEquipment,
    unmatchedGroupEquipment: equipResult.unmatchedGroupEquipment,
    groupLoad,
    lineSummaries,
    indirectOvertimePeople: indirect.overtimePeople,
    indirectIsPresent: indirect.isPresent,
  };
}

export type ComputeResult = ReturnType<typeof computeAll>;
