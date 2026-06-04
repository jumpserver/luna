pub(crate) mod assets {
    pub(crate) const MY_ASSET: &str = "/api/v1/assets/my-asset/";
    pub(crate) const USER_ASSETS: &str = "/api/v1/perms/users/self/assets/";
    pub(crate) const FAVORITE_ASSETS: &str = "/api/v1/assets/favorite-assets/";
    pub(crate) const FAVORITE_NODE_ASSETS: &str = "/api/v1/perms/users/self/nodes/favorite/assets/";

    pub(crate) fn detail(asset_id: &str) -> String {
        format!("/api/v1/perms/users/self/assets/{}", asset_id)
    }
}

pub(crate) mod authentication {
    pub(crate) const CONNECTION_TOKEN: &str = "/api/v1/authentication/connection-token/";

    pub(crate) fn client_url(token_id: &str) -> String {
        format!(
            "/api/v1/authentication/connection-token/{}/client-url/",
            token_id
        )
    }
}

pub(crate) mod terminal {
    pub(crate) const CONNECT_METHODS: &str = "/api/v1/terminal/components/connect-methods/";
}

pub(crate) mod user {
    pub(crate) const PROFILE: &str = "/api/v1/users/profile/";
    pub(crate) const PROFILE_PERMISSIONS: &str = "/api/v1/users/profile/permissions/";
    pub(crate) const LUNA_PREFERENCE: &str = "/api/v1/users/preference/?category=luna";
}

pub(crate) mod org {
    pub(crate) const CURRENT: &str = "/api/v1/orgs/orgs/current/";
}

pub(crate) mod settings {
    pub(crate) const PUBLIC: &str = "/api/v1/settings/public/";
    pub(crate) const CLIENT_VERSIONS: &str = "/api/v1/settings/client/versions/";
}
