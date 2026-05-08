import type { WorkGroup } from "@/lib/types";

// 사용자 확정 (작업자 → 작업그룹 매핑)
// 설비명은 spec md 7장 기준 (사용자가 향후 기준자료 페이지에서 편집 가능)
export const DEFAULT_WORK_GROUPS: WorkGroup[] = [
  {
    name: "자동판금",
    workers: ["손수영", "바와니"],
    minPeople: 1,
    equipmentNames: [
      "#N/C절단기",
      "#N/C절단기(배가름)",
      "#자동 밴딩 1호기(구형)",
      "#자동 밴딩 2호기(신형)",
      "#자동 밴딩 3호기(신형)_200전",
      "#자동 펀칭 1호기(구형)",
      "#자동 펀칭 2호기(신형)",
      "#콘덴서 스폿 용접기",
    ],
  },
  {
    name: "전동침대",
    workers: ["장인수", "김종인"],
    minPeople: 1,
    equipmentNames: [
      "#전동침대 용접_1호기",
      "#전동침대 용접_2호기",
      "#전동침대 용접_3호기",
    ],
  },
  {
    name: "쿠시노",
    workers: ["강정식"],
    minPeople: 1,
    equipmentNames: ["#쿠시노 침대프레임 용접기"],
  },
  {
    name: "데스커 용접",
    workers: ["송인덕", "비니얀", "쿠마르싱", "하리스"],
    minPeople: 2,
    equipmentNames: [
      "#데스커 용접 자동화_1호기",
      "#데스커 용접 자동화_2호기",
      "#데스커 용접_2호기",
    ],
  },
  {
    name: "프레임 용접",
    workers: ["홍기표", "미툰"],
    minPeople: 1,
    equipmentNames: [
      "#파티션 프레임 롤포밍기",
      "#파티션 프레임 용접1호기",
      "#파티션 프레임 용접3호기",
    ],
  },
  {
    name: "타일 1호기",
    workers: ["김용규"],
    minPeople: 1,
    equipmentNames: ["#타일CRF 1호기"],
  },
  {
    name: "타일 2호기",
    workers: ["이경남"],
    minPeople: 1,
    equipmentNames: [
      "#타일CRF 2호기",
      "#프레스3호기(기계식 200톤)단변",
      "#프레스3호기(기계식 200톤)타일",
    ],
  },
  {
    name: "레이져",
    workers: ["주지훈"],
    minPeople: 1,
    equipmentNames: [
      "#SPOT 용접",
      "#레이져",
      "#수동 용접",
      "#수동 용접(파이프)",
      "#절곡 1호기(5자)",
      "#절곡 2호기(8자)",
      "#탁상드릴(C'SINK,TAP)",
    ],
  },
];

// 간접인원 (별도 처리 - 잔업 발생 시에만 표시)
export const INDIRECT_WORKER = "김진규";

// 데스커 자동화 (반영계수 0.5 적용)
export const DASKER_AUTOMATION_EQUIPMENT = [
  "#데스커 용접 자동화_1호기",
  "#데스커 용접 자동화_2호기",
];
