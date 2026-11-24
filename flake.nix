{
  description = "Calene — immersive 1-on-1 video chat and co-viewing web client for Galene";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    {
      self,
      nixpkgs,
    }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems =
        f:
        nixpkgs.lib.genAttrs systems (
          system:
          f {
            inherit system;
            pkgs = nixpkgs.legacyPackages.${system};
          }
        );
    in
    {
      packages = forAllSystems (
        { pkgs, ... }:
        let
          calene = pkgs.callPackage ./package.nix { };
        in
        {
          inherit calene;
          default = calene;
        }
      );

      overlays.default = final: _prev: {
        calene = final.callPackage ./package.nix { };
      };
    };
}
