import Image from "next/image";

interface SchoolixLogoProps {
  variant?: "icon" | "full";
  size?: number;
}

export default function SchoolixLogo({ variant = "full", size = 32 }: SchoolixLogoProps) {
  // The portrait PNG has transparent margins. Size the artwork inside a stable square slot.
  const imageWidth = Math.round(size * 1.2);

  return (
    <span className="inline-flex shrink-0 items-center gap-[0.3em] align-middle">
      <span className="inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
        <Image
          src="/logo.png"
          alt={variant === "icon" ? "Schoolix" : ""}
          width={imageWidth}
          height={Math.round(imageWidth * 4 / 3)}
          loading="eager"
          className="pointer-events-none block h-auto max-w-none shrink-0"
        />
      </span>
      {variant === "full" && (
        <span className="whitespace-nowrap">School<span className="text-[color:var(--schoolix-wordmark-accent,#8B6DF2)]">ix</span></span>
      )}
    </span>
  );
}
