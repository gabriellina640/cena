import type { NextConfig } from "next";
const config:NextConfig={poweredByHeader:false,images:{unoptimized:true},outputFileTracingIncludes:{"/api/catalog":["./data/catalogo/**/*"]}};
export default config;
