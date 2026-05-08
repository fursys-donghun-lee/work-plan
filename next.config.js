/** @type {import('next').NextConfig} */
// GitHub Pages 정적 호스팅 설정
// - output: "export" → out/ 디렉토리로 정적 파일 생성
// - basePath / assetPrefix → 사용자 사이트(<user>.github.io)는 빈 값, 프로젝트 사이트는 "/<repo-name>"
//   GitHub Actions 에서 NEXT_PUBLIC_BASE_PATH 환경변수로 주입
const repoBase = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: repoBase || undefined,
  assetPrefix: repoBase || undefined,
};

module.exports = nextConfig;
