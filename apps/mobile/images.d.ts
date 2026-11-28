// Metro resolves image imports to an asset id that <Image source> accepts.
declare module "*.png" {
  const asset: number;
  export default asset;
}
