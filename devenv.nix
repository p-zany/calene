{
  pkgs,
  config,
  ...
}:
{
  languages.javascript = {
    enable = true;
    npm.enable = true;
  };

  packages = [
    pkgs.galene
  ];

  env = {
    GALENE_ADDR = "127.0.0.1:8443";
    VITE_GALENE_PROXY_TARGET = "http://127.0.0.1:8443";
  };

  processes = {
    galene = {
      exec = ''
        mkdir -p "${config.env.DEVENV_STATE}/galene/data" "${config.env.DEVENV_STATE}/galene/static"
        exec galene \
          -insecure \
          -http "$GALENE_ADDR" \
          -groups "${config.env.DEVENV_ROOT}/groups" \
          -data "${config.env.DEVENV_STATE}/galene/data" \
          -static "${config.env.DEVENV_STATE}/galene/static"
      '';
      process-compose = {
        readiness_probe = {
          http_get = {
            host = "127.0.0.1";
            port = 8443;
            path = "/group/example/.status";
          };
          initial_delay_seconds = 1;
          period_seconds = 2;
        };
      };
    };

    frontend = {
      exec = "npm run dev -- --host";
      process-compose = {
        depends_on = {
          galene = {
            condition = "process_healthy";
          };
        };
      };
    };
  };

  scripts = {
    "preview-galene".exec = ''
      npm run build
      mkdir -p "${config.env.DEVENV_STATE}/galene/data"
      exec galene \
        -insecure \
        -http "$GALENE_ADDR" \
        -groups "${config.env.DEVENV_ROOT}/groups" \
        -static "${config.env.DEVENV_ROOT}/dist" \
        -data "${config.env.DEVENV_STATE}/galene/data"
    '';
  };
}
