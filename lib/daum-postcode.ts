"use client";

// Daum(카카오) 우편번호 서비스 — 별도 API 키 없이 쓸 수 있는 공식 CDN 스크립트.
//
// daum.Postcode의 .open()은 내부적으로 window.open()을 쓰는데, 브라우저 팝업
// 차단은 "클릭 이벤트 핸들러 안에서 동기적으로 호출됐는지"를 기준으로 판단한다.
// 클릭 시점에야 스크립트를 비동기로 불러오면 로딩을 기다리는 사이 user-gesture가
// 끊겨서 팝업이 차단될 수 있다. 그래서 화면 마운트 시점에 미리 로드해두고
// (preloadAddressSearch), 스크립트가 이미 로드돼 있으면 클릭 핸들러에서 항상
// 동기적으로 팝업을 연다.
const SCRIPT_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

interface DaumPostcodeData {
  zonecode: string;
  roadAddress: string;
  apartment: "Y" | "N";
  buildingName: string;
}

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: { oncomplete: (data: DaumPostcodeData) => void; onclose?: (state: string) => void }) => { open: () => void };
    };
  }
}

let loadPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("주소검색은 브라우저에서만 사용할 수 있어요."));
  if (window.daum?.Postcode) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.onload = () => resolve();
      script.onerror = () => {
        loadPromise = null;
        reject(new Error("주소검색 스크립트를 불러오지 못했어요."));
      };
      document.head.appendChild(script);
    });
  }
  return loadPromise;
}

// 배송지 입력 화면이 열리면 바로 호출해서 스크립트를 미리 받아둔다.
export function preloadAddressSearch(): void {
  loadScript().catch(() => {});
}

export interface DaumAddressResult {
  zonecode: string;
  roadAddress: string;
  // 검색 결과가 공동주택(아파트/오피스텔 등)일 때만 채워짐. 관리자가 아파트
  // 단지별로 필터링/일괄 처리할 수 있도록 저장해두는 값이라, 해당 없는
  // 단독주택 등은 빈 문자열로 둔다.
  apartmentName: string;
}

const CLOSED = new Error("CLOSED");

function runPostcode(resolve: (result: DaumAddressResult) => void, reject: (error: Error) => void) {
  let resolved = false;
  new window.daum!.Postcode({
    oncomplete: (data) => {
      resolved = true;
      resolve({
        zonecode: data.zonecode ?? "",
        roadAddress: data.roadAddress ?? "",
        apartmentName: data.apartment === "Y" ? (data.buildingName ?? "") : "",
      });
    },
    onclose: (state) => {
      if (!resolved && state === "FORCE_CLOSE") reject(CLOSED);
    },
  }).open();
}

// 스크립트가 이미 로드돼 있으면(preloadAddressSearch 호출 후) 팝업을 동기적으로
// 열어 브라우저 팝업 차단을 피한다. 아직 로드 전이면 기다렸다 여는데, 이 경우
// 클릭과 팝업 사이에 지연이 생겨 브라우저에 따라 차단될 수 있다.
export function openAddressSearch(): Promise<DaumAddressResult> {
  if (window.daum?.Postcode) {
    return new Promise<DaumAddressResult>((resolve, reject) => runPostcode(resolve, reject));
  }
  return loadScript().then(() => new Promise<DaumAddressResult>((resolve, reject) => runPostcode(resolve, reject)));
}

// 사용자가 검색창을 그냥 닫은 경우(선택 안 함)를 구분하기 위한 헬퍼 — 이
// 경우엔 에러 메시지를 보여줄 필요가 없다.
export function isAddressSearchClosed(error: unknown): boolean {
  return error === CLOSED;
}
