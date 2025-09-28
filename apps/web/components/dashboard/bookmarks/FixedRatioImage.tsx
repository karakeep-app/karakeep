"use client";

import { useState } from "react";
import Image from "next/image";

export default function FixedRatioImage({
  src,
  unoptimized,
  className,
  alt,
}: {
  src: string;
  unoptimized: boolean;
  className: string | undefined;
  alt: string;
}) {
  const [height, setHeight] = useState<number>(0);
  const [width, setWidth] = useState<number>(0);

  if (height === null) return <div></div>;

  const onImgLoad = ({ target }: React.SyntheticEvent<HTMLImageElement>) => {
    const img = target as HTMLImageElement;
    setHeight(img.offsetHeight);
    setWidth(img.offsetWidth);
  };

  return (
    <Image
      onLoad={onImgLoad}
      width={width}
      height={height}
      unoptimized={unoptimized}
      className={className}
      alt={alt}
      fill={false}
      src={src}
    />
  );
}
