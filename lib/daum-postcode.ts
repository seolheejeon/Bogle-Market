// 다음(카카오) 우편번호 서비스 — 무료, API 키 불필요.
// https://postcode.map.daum.net 공개 임베드 스크립트를 사용한다.
//
// daum.Postcode의 .open()은 내부적으로 window.open()을 쓰는데, 브라우저 팝업 차단은
// "클릭 이벤트 핸들러 안에서 동기적으로 호출됐는지"를 기준으로 판단한다. 스크립트를
// 클릭 시점에 비동기로 불러오면(await 이후 open() 호출) 그 사이에 user-gesture가
// 끊겨서 팝업이 차단된다. 그래서 화면 마운트 시점에 미리 로드해두고(preload),
// 클릭 핸들러에서는 항상 동기적으로 open()을 호출한다.

const SCRIPT_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

interface DaumPostcodeResult {
  zonecode: string;
  address: string;
  roadAddress: string;
  jibunAddress: string;
  buildingName: string;
  apartment: "Y" | "N";
}

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: { oncomplete: (data: DaumPostcodeResult) => void; onclose?: (state: string) => void }) => { open: () => void };
    };
  }
}

let loadPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.daum?.Postcode) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.onload = () => resolve();
      script.onerror = () => {
        loadPromise = null;
        reject(new Error("주소 검색 스크립트를 불러오지 못했어요."));
      };
      document.head.appendChild(script);
    });
  }
  return loadPromise;
}

/** 배송지 입력 화면이 열리면 바로 호출해서 스크립트를 미리 받아둔다. */
export function preloadAddressSearch(): void {
  loadScript().catch(() => {});
}

function resolveApartmentName(data: DaumPostcodeResult): string {
  return data.apartment === "Y" && data.buildingName ? data.buildingName : data.roadAddress || data.address || data.jibunAddress;
}

/**
 * 주소 검색 팝업을 연다. 반드시 클릭 핸들러 안에서 동기적으로 호출해야
 * 팝업 차단을 피할 수 있다 (스크립트가 preload 돼 있으면 바로 열리고,
 * 아직이면 로드를 기다렸다 여는데 이 경우 브라우저에 따라 차단될 수 있다).
 */
export function openAddressSearch(onSelect: (apartment: string) => void): void {
  if (window.daum?.Postcode) {
    new window.daum.Postcode({ oncomplete: (data) => onSelect(resolveApartmentName(data)) }).open();
    return;
  }
  loadScript().then(() => {
    new window.daum!.Postcode({ oncomplete: (data) => onSelect(resolveApartmentName(data)) }).open();
  });
}
