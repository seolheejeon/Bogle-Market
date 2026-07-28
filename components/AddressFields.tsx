"use client";

import { useEffect, useState } from "react";
import { openAddressSearch, preloadAddressSearch, isAddressSearchClosed } from "@/lib/daum-postcode";

export interface AddressFieldsValue {
  zonecode: string;
  roadAddress: string;
  apartmentName: string;
  detailAddress: string;
  entranceMethod: string;
  memo: string;
}

export const EMPTY_ADDRESS_FIELDS: AddressFieldsValue = {
  zonecode: "",
  roadAddress: "",
  apartmentName: "",
  detailAddress: "",
  entranceMethod: "",
  memo: "",
};

interface AddressFieldsProps {
  value: AddressFieldsValue;
  onChange: (patch: Partial<AddressFieldsValue>) => void;
  // 택배배송은 공동현관 출입방법이 필요 없어서 숨길 수 있어야 함.
  showEntranceMethod?: boolean;
  showMemo?: boolean;
}

// 회원가입/마이페이지/체크아웃이 전부 이 컴포넌트 하나를 써서 "주소검색 →
// 도로명주소 자동입력 → 상세주소/공동현관 출입방법 직접입력" 순서를 동일하게
// 유지한다. 아파트명은 검색 결과에서 뽑아 value에 같이 담아두되(관리자 필터용),
// 화면에는 따로 보여주지 않는다 — 사용자가 입력할 항목이 아니기 때문.
export function AddressFields({ value, onChange, showEntranceMethod = true, showMemo = true }: AddressFieldsProps) {
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 클릭 시점에야 스크립트를 처음 불러오면 그 사이 user-gesture가 끊겨 팝업이
  // 차단될 수 있어서, 이 컴포넌트가 화면에 나타나는 즉시 미리 로드해둔다.
  useEffect(() => {
    preloadAddressSearch();
  }, []);

  async function search() {
    setError(null);
    setSearching(true);
    try {
      const result = await openAddressSearch();
      onChange({ zonecode: result.zonecode, roadAddress: result.roadAddress, apartmentName: result.apartmentName });
    } catch (e) {
      if (!isAddressSearchClosed(e)) setError(e instanceof Error ? e.message : "주소검색 중 오류가 발생했어요.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-[9px] border border-border bg-bg-sunken px-3 py-2.5 text-[13px] text-text-muted"
          placeholder="주소검색 버튼을 눌러주세요"
          value={value.roadAddress}
          readOnly
        />
        <button type="button" onClick={search} disabled={searching} className="shrink-0 rounded-[9px] border border-border px-3 text-[12.5px] font-semibold disabled:opacity-50">
          {searching ? "검색 중..." : "주소검색"}
        </button>
      </div>
      {error && <p className="text-[11.5px] font-semibold text-red-600">{error}</p>}
      <input
        className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
        placeholder="상세주소 (동/호수 등)"
        value={value.detailAddress}
        onChange={(e) => onChange({ detailAddress: e.target.value })}
      />
      {showEntranceMethod && (
        <input
          className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
          placeholder="공동현관 출입방법 (예: 비밀번호, 호출 방법 등)"
          value={value.entranceMethod}
          onChange={(e) => onChange({ entranceMethod: e.target.value })}
        />
      )}
      {showMemo && (
        <input
          className="rounded-[9px] border border-border bg-bg-card px-3 py-2.5 text-[13px]"
          placeholder="배송메모 (선택)"
          value={value.memo}
          onChange={(e) => onChange({ memo: e.target.value })}
        />
      )}
    </div>
  );
}
