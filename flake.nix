{
  description = "collab.abhikja.in dev environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            bun
            dprint
            oxlint
          ];

          shellHook = ''
            echo "collab dev shell — bun $(bun --version), dprint $(dprint --version), oxlint $(oxlint --version)"
          '';
        };
      });
}
