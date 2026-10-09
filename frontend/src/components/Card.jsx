import clsx from "clsx";

export default function Card({ children, className, as: Component = "section", ...props }) {
  return <Component className={clsx("glass-panel min-w-0 rounded-[24px] p-4 sm:rounded-[28px] sm:p-5", className)} {...props}>{children}</Component>;
}
