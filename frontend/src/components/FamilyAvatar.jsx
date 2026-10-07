import { useState } from "react";

export default function FamilyAvatar({ family, className = "h-10 w-10" }) {
  const [failedUrl, setFailedUrl] = useState(null);
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush/10 font-bold text-blush ${className}`}>
      {family?.image_url && failedUrl !== family.image_url
        ? <img src={family.image_url} alt="" className="h-full w-full object-cover" onError={() => setFailedUrl(family.image_url)} />
        : (family?.name || "F").slice(0, 1).toUpperCase()}
    </span>
  );
}
