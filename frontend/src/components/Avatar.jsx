import { useEffect, useState } from "react";

import { resolveApiAssetUrl } from "../services/api";
import { initials } from "../utils/formatters";

export default function Avatar({ user, size = "md" }) {
  const [imageBroken, setImageBroken] = useState(false);
  const sizes = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-14 w-14 text-base"
  };
  const imageUrl = imageBroken ? "" : resolveApiAssetUrl(user?.avatar_url);

  useEffect(() => {
    setImageBroken(false);
  }, [user?.avatar_url]);

  return (
    <div className={`${sizes[size]} grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-rose-200 to-violet-200 font-bold text-ink ring-4 ring-white`}>
      {imageUrl ? (
        <img src={imageUrl} alt={user?.name || "Usuario"} className="h-full w-full rounded-full object-cover" onError={() => setImageBroken(true)} />
      ) : (
        initials(user?.name)
      )}
    </div>
  );
}
