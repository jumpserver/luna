pub(crate) mod authentication {
    pub(crate) const CONNECTION_TOKEN: &str = "/api/v1/authentication/connection-token/";

    pub(crate) fn client_url(token_id: &str) -> String {
        format!(
            "/api/v1/authentication/connection-token/{}/client-url/",
            token_id
        )
    }
}

pub(crate) mod user {
    pub(crate) const PROFILE: &str = "/api/v1/users/profile/";
    pub(crate) const PROFILE_PERMISSIONS: &str = "/api/v1/users/profile/permissions/";
}

pub(crate) mod org {
    pub(crate) const CURRENT: &str = "/api/v1/orgs/orgs/current/";
}

pub(crate) mod settings {
    pub(crate) const PUBLIC: &str = "/api/v1/settings/public/";
    pub(crate) const CLIENT_VERSIONS: &str = "/api/v1/settings/client/versions/";
}

pub(crate) mod oauth {
    pub(crate) const WELL_KNOWN: &str =
        "/core/auth/oauth2-provider/.well-known/oauth-authorization-server";
    pub(crate) const AUTHORIZE: &str = "/core/auth/oauth2-provider/authorize/";
    pub(crate) const TOKEN: &str = "/core/auth/oauth2-provider/token/";
    pub(crate) const REVOKE: &str = "/core/auth/oauth2-provider/revoke/";
}
