import { Suspense } from "react";
import { CategoryView } from "@/components/Category/CategoryView";

export default function CategoryPage() {
  return (
    <Suspense>
      <CategoryView />
    </Suspense>
  );
}
