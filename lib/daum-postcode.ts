"use client";

// Daum(카카오) 우편번호 서비스 — 스크립트를 한 번만 로드해두고, 검색 팝업은
// 호출할 때마다 새로 연다. 서비스 도메인 자체가 공식 CDN이라 별도 API 키가
// 필요 없다.
const SCRIPT_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

let loadPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("주소검색은 브라우저에서만 사용할 수 있어요."));
  if ((window as any).daum?.Postcode) return Promise.resolve();
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

export interface DaumAddressResult {
  zonecode: string;
  roadAddress: string;
  // 검색 결과가 공동주택(아파트/오피스텔 등)일 때만 채워짐. 관리자가 아파트
  // 단지별로 필터링/일괄 처리할 수 있도록 저장해두는 값이라, 해당 없는
  // 단독주택 등은 빈 문자열로 둔다.
  apartmentName: string;
}

const CLOSED = new Error("CLOSED");

export function openAddressSearch(): Promise<DaumAddressResult> {
  return loadScript().then(
    () =>
      new Promise<DaumAddressResult>((resolve, reject) => {
        let resolved = false;
        new (window as any).daum.Postcode({
          oncomplete: (data: any) => {
            resolved = true;
            resolve({
              zonecode: data.zonecode ?? "",
              roadAddress: data.roadAddress ?? "",
              apartmentName: data.apartment === "Y" ? (data.buildingName ?? "") : "",
            });
          },
          onclose: (state: string) => {
            if (!resolved && state === "FORCE_CLOSE") reject(CLOSED);
          },
        }).open();
      }),
  );
}

// 사용자가 검색창을 그냥 닫은 경우(선택 안 함)를 구분하기 위한 헬퍼 — 이
// 경우엔 에러 메시지를 보여줄 필요가 없다.
export function isAddressSearchClosed(error: unknown): boolean {
  return error === CLOSED;
}
