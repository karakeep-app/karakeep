// TypeScript 7 checks that side-effect imports resolve; this covers
// `import "@/globals.css"`, which Metro and NativeWind handle.
declare module "*.css";
