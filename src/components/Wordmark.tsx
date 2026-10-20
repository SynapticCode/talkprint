export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const text = size === "lg" ? "text-4xl sm:text-5xl" : "text-xl";
  return (
    <span className={`${text} font-black tracking-tight`}>
      Talk<span className="text-accent">print</span>
    </span>
  );
}
