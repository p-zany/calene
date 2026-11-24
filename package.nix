{
  lib,
  buildNpmPackage,
  nodejs,
}:
let
  pkg = lib.importJSON ./package.json;
in
buildNpmPackage {
  pname = pkg.name;
  inherit (pkg) version;

  inherit nodejs;

  src = lib.fileset.toSource {
    root = ./.;
    fileset = lib.fileset.unions [
      ./package.json
      ./package-lock.json
      ./index.html
      ./galene.html
      ./vite.config.ts
      ./svelte.config.js
      ./tsconfig.json
      ./public
      ./src
    ];
  };

  npmDepsHash = "sha256-JJRlp4DZKUQjEFwVpR4y8c/r2Lppc4C6OTSusmQDk5o=";

  installPhase = ''
    runHook preInstall
    cp -r dist "$out"
    runHook postInstall
  '';

  meta = {
    description = "Immersive 1-on-1 video chat and co-viewing web client for Galene";
    homepage = "https://github.com/p-zany/calene";
    platforms = lib.platforms.all;
  };
}
