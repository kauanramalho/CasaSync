import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function PasswordInput({ className = "", inputClassName = "", id, ...props }) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className={`relative ${className}`}>
      <input
        {...props}
        id={inputId}
        className={`soft-input pr-12 ${inputClassName}`}
        type={visible ? "text" : "password"}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-muted transition hover:bg-blush/10 hover:text-blush"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        aria-controls={inputId}
        onClick={() => setVisible((current) => !current)}
      >
        <Icon className="h-4 w-4" />
      </button>
    </div>
  );
}
