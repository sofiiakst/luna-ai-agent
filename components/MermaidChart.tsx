// components/MermaidChart.tsx
"use client";
import { useEffect, useState } from "react";
import mermaid from "mermaid";

type Props = { code: string };

export default function MermaidChart({ code }: Props) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: "default" });
    if (code) {
      mermaid.render("mermaid-diagram", code).then(({ svg }) => {
        setSvg(svg);
      });
    }
  }, [code]);

  return (
    <div
      className="p-4 border rounded bg-white shadow"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
