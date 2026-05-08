import { initials } from "../utils/formatters";

export default function Avatar({ user, size = "md" }) {
  const sizes = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-14 w-14 text-base"
  };

  return (
    <div className={`${sizes[size]} grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-rose-200 to-violet-200 font-bold text-ink ring-4 ring-white`}>
      {user?.avatar_url ? <img src={user.avatar_url} alt={user.name} className="h-full w-full rounded-full object-cover" /> : initials(user?.name)}
    </div>
  );
}

