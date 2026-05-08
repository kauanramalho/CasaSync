import clsx from "clsx";

export default function Card({ children, className }) {
  return <section className={clsx("glass-panel rounded-[28px] p-5", className)}>{children}</section>;
}

