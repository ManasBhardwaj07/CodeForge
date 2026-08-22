export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-fade-in" style={{ animationDuration: "250ms" }}>
      {children}
    </div>
  );
}
