export interface Role {
    access: string[];
    priority: number;
    extends: string | null;
}

export interface ConfigData {
    EMAIL_BLACKLIST: string[];
    ROLES: Map<string, Role>;
    DEFAULT_ROLE: string | null;
    CHAT_FILTER: Map<string, string>;
}

interface ConfigProps {
    roles: Array<{
        name: string;
        access: string[];
        extends?: string;
        priority: number;
        default?: boolean;
    }>;
    users: Array<{
        name: string;
        role: string;
    }>;
}

export interface UserProfile {
    role: string | null;
}

const CONFIG_TOML: ConfigProps = {
    roles: [
        {
            name: "Admin",
            priority: 9999,
            access: ['*'],
        },
        {
            name: "Moderator",
            priority: 2,
            access: [
                '/api/admin/user/set/email',
                '/api/admin/user/ban',
                '/api/admin/user/grant',
                '/api/admin/user/rename',
                '/api/admin/user/notify',
                '/api/admin/players',
                '/api/admin/club/delete',
                '/api/admin/club/rename',
                '/api/admin/logs',
                '/api/admin/logs/process',
                '/api/admin/user/delete',
                '/api/mod/delete',
                'command.announce',
                'admin.club.edit',
                'mod.warns',
            ],
            extends: 'Helper',
        },
        {
            name: "Helper",
            priority: 1,
            access: [
                '/api/admin/score/delete',
                '/api/admin/user/warn',
                '/api/admin/user/warn/delete',
                '/api/admin/user/warn/list',
                '/api/admin/user/ips',
                '/api/admin/report/*',
                '/api/mod/dl/*',
                '/api/mod/submit',
                '/api/mod/edit',
                '/admin',
            ],
            extends: 'Member',
        },
        {
            name: "Member",
            priority: 0,
            default: true,
            access: [
                '/api/sez',
                '/api/account/*',
                '/api/song/*',
                '/api/score/*',
                '/api/user/*',
                '/api/club/*',
                '/api/mod/fav',
                'room.auth',
            ],
        },
        {
            name: "Banned",
            priority: -1,
            access: [],
        },
    ],
    users: [
        { name: 'Snirozu', role: 'Admin' },
    ],
};

function extendRole(role: Role, to: Role, roles: Map<string, Role>): void {
    if (to.access)
        role.access = role.access.concat(to.access);

    if (to.extends)
        extendRole(role, roles.get(to.extends)!, roles);
}

function matchesAccess(path: string, accessPattern: string): boolean {
    if (accessPattern === '*') return true;
    if (accessPattern.endsWith('/*')) {
        const prefix = accessPattern.slice(0, -2);
        return path.startsWith(prefix);
    }
    return path === accessPattern;
}

let cachedConfig: ConfigData | null = null;

export function loadConfig(): ConfigData {
    if (cachedConfig) return cachedConfig;

    const roles = new Map<string, Role>();

    for (const roleDef of CONFIG_TOML.roles) {
        roles.set(roleDef.name, {
            access: [...roleDef.access],
            priority: roleDef.priority,
            extends: roleDef.extends ?? null,
        });
    }

    for (const roleDef of CONFIG_TOML.roles) {
        if (roleDef.extends) {
            extendRole(roles.get(roleDef.name)!, roles.get(roleDef.extends)!, roles);
        }
    }

    let defaultRole: string | null = null;
    for (const roleDef of CONFIG_TOML.roles) {
        if (roleDef.default) {
            defaultRole = roleDef.name;
        }
    }

    cachedConfig = {
        EMAIL_BLACKLIST: [],
        ROLES: roles,
        DEFAULT_ROLE: defaultRole,
        CHAT_FILTER: new Map(),
    };

    return cachedConfig;
}

export function hasAccess(user: UserProfile, path: string): boolean {
    const config = loadConfig();
    const roleName = user.role ?? config.DEFAULT_ROLE;
    if (!roleName) return false;

    const role = config.ROLES.get(roleName);
    if (!role) return false;

    for (const access of role.access) {
        if (matchesAccess(path, access)) return true;
    }

    return false;
}

export function getPriority(user: UserProfile): number {
    const config = loadConfig();
    const roleName = user.role ?? config.DEFAULT_ROLE;
    if (!roleName) return 0;

    const role = config.ROLES.get(roleName);
    return role?.priority ?? 0;
}
