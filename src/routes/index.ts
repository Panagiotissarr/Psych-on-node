import { Env } from '../env';
import { handleSezdetal, handleOnline, handleSez, handleNextweekreset, handleFront, handleOnlinecount, handleRooms } from './root';
import { handleRegister, handleLogin, handleCookie, handleLogout } from './auth';
import { handleAccountMe, handleAccountInfo, handleAccountFriends, handleAccountAvatar, handleAccountBackground, handleAccountRemoveImages, handleAccountClub, handleAccountProfileSet, handleAccountRename, handleAccountEmailSet, handleAccountDelete, handleAccountNotifications, handleAccountNotificationsDelete, handleAccountLinkNewgrounds, handleAccountUnlinkNewgrounds, handleAccountResetSecret } from './account';
import { handleUserFriendsRemove, handleUserFriendsRequest, handleUserAvatar, handleUserBackground, handleUserInfo, handleUserDetails, handleUserScores } from './user';
import { handleScoreReplay, handleScoreReport, handleScoreSubmit, handleScoreDelete, handleScoreSetModurl } from './score';
import { handleSongComments, handleSongComment } from './song';
import { handleTopSong, handleTopPlayers, handleTopClubs } from './top';
import { handleSearchSongs, handleSearchUsers, handleSearchMods } from './search';
import { handleStatsDayPlayers, handleStatsCountryPlayers } from './stats';
import { handleClubDetails, handleClubBanner, handleClubPending, handleClubCreate, handleClubJoin, handleClubAccept, handleClubReject, handleClubKick, handleClubPromote, handleClubDemote, handleClubLeave, handleClubBannerPost, handleClubEdit } from './club';
import { handleModDetails, handleModSubmit, handleModEdit, handleModDelete, handleModFav, handleModDlSubmit, handleModDlDelete, handleModDlEdit, handleModDlRedirect } from './mod';
import { handleAdminUserIps, handleAdminUserData, handleAdminUserSetEmail, handleAdminUserDelete, handleAdminClubDelete, handleAdminClubUpdatefp, handleAdminUserBan, handleAdminUserWarn, handleAdminUserWarnDelete, handleAdminUserWarnList, handleAdminScoreDelete, handleAdminPlayers, handleAdminReloadconfig, handleAdminUserGrant, handleAdminUserNotify, handleAdminUserRename, handleAdminReportList, handleAdminReportContent, handleAdminReportDelete, handleAdminLogs, handleAdminLogsProcess, handleAdminCooldownClear, handleAdminEndweekly, handleAdminUpdateweekly, handleAdminSongSubmit } from './admin';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Network-Id, X-Network-Token',
};

function options(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return options();

  const url = new URL(request.url);
  const path = url.pathname;

  try {
    let response: Response;

    // Root routes
    if (path === '/api/sezdetal') response = await handleSezdetal(request, env, url);
    else if (path === '/api/online') response = await handleOnline(request, env, url);
    else if (path === '/api/sez' && request.method === 'POST') response = await handleSez(request, env, url);
    else if (path === '/api/nextweekreset') response = await handleNextweekreset(request, env, url);
    else if (path === '/api/front') response = await handleFront(request, env, url);
    else if (path === '/api/onlinecount') response = await handleOnlinecount(request, env, url);
    else if (path === '/rooms') response = await handleRooms(request, env, url);

    // Auth routes
    else if (path === '/api/auth/register') response = await handleRegister(request, env, url);
    else if (path === '/api/auth/login') response = await handleLogin(request, env, url);
    else if (path === '/api/auth/cookie') response = await handleCookie(request, env, url);
    else if (path === '/api/auth/logout') response = await handleLogout(request, env, url);

    // Account routes
    else if (path === '/api/account/me') response = await handleAccountMe(request, env, url);
    else if (path === '/api/account/info') response = await handleAccountInfo(request, env, url);
    else if (path === '/api/account/friends') response = await handleAccountFriends(request, env, url);
    else if (path === '/api/account/avatar' && request.method === 'POST') response = await handleAccountAvatar(request, env, url);
    else if (path === '/api/account/background' && request.method === 'POST') response = await handleAccountBackground(request, env, url);
    else if (path === '/api/account/removeimages') response = await handleAccountRemoveImages(request, env, url);
    else if (path === '/api/account/club') response = await handleAccountClub(request, env, url);
    else if (path === '/api/account/profile/set' && request.method === 'POST') response = await handleAccountProfileSet(request, env, url);
    else if (path === '/api/account/rename' && request.method === 'POST') response = await handleAccountRename(request, env, url);
    else if (path === '/api/account/email/set') response = await handleAccountEmailSet(request, env, url);
    else if (path === '/api/account/delete') response = await handleAccountDelete(request, env, url);
    else if (path === '/api/account/notifications') response = await handleAccountNotifications(request, env, url);
    else if (path.startsWith('/api/account/notifications/delete/')) {
      const notifId = path.split('/api/account/notifications/delete/')[1];
      response = await handleAccountNotificationsDelete(request, env, url, notifId);
    }
    else if (path === '/api/account/link/newgrounds') response = await handleAccountLinkNewgrounds(request, env, url);
    else if (path === '/api/account/unlink/newgrounds') response = await handleAccountUnlinkNewgrounds(request, env, url);
    else if (path === '/api/account/resetsecret') response = await handleAccountResetSecret(request, env, url);

    // User routes
    else if (path === '/api/user/friends/remove') response = await handleUserFriendsRemove(request, env, url);
    else if (path === '/api/user/friends/request') response = await handleUserFriendsRequest(request, env, url);
    else if (path.startsWith('/api/user/avatar/')) {
      const user = decodeURIComponent(path.split('/api/user/avatar/')[1]);
      response = await handleUserAvatar(request, env, url, user);
    }
    else if (path.startsWith('/api/user/background/')) {
      const user = decodeURIComponent(path.split('/api/user/background/')[1]);
      response = await handleUserBackground(request, env, url, user);
    }
    else if (path === '/api/user/info') response = await handleUserInfo(request, env, url);
    else if (path === '/api/user/details') response = await handleUserDetails(request, env, url);
    else if (path === '/api/user/scores') response = await handleUserScores(request, env, url);

    // Score routes
    else if (path === '/api/score/replay') response = await handleScoreReplay(request, env, url);
    else if (path === '/api/score/report' && request.method === 'POST') response = await handleScoreReport(request, env, url);
    else if (path === '/api/score/submit' && request.method === 'POST') response = await handleScoreSubmit(request, env, url);
    else if (path === '/api/score/delete') response = await handleScoreDelete(request, env, url);
    else if (path === '/api/score/set/modurl') response = await handleScoreSetModurl(request, env, url);

    // Song routes
    else if (path === '/api/song/comments') response = await handleSongComments(request, env, url);
    else if (path === '/api/song/comment' && request.method === 'POST') response = await handleSongComment(request, env, url);

    // Top routes
    else if (path === '/api/top/song') response = await handleTopSong(request, env, url);
    else if (path === '/api/top/players') response = await handleTopPlayers(request, env, url);
    else if (path === '/api/top/clubs') response = await handleTopClubs(request, env, url);

    // Search routes
    else if (path === '/api/search/songs') response = await handleSearchSongs(request, env, url);
    else if (path === '/api/search/users') response = await handleSearchUsers(request, env, url);
    else if (path === '/api/search/mods') response = await handleSearchMods(request, env, url);

    // Stats routes
    else if (path === '/api/stats/day_players') response = await handleStatsDayPlayers(request, env, url);
    else if (path === '/api/stats/country_players') response = await handleStatsCountryPlayers(request, env, url);

    // Club routes
    else if (path === '/api/club/details') response = await handleClubDetails(request, env, url);
    else if (path.startsWith('/api/club/banner/')) {
      const tag = decodeURIComponent(path.split('/api/club/banner/')[1]);
      response = await handleClubBanner(request, env, url, tag);
    }
    else if (path === '/api/club/banner' && request.method === 'POST') response = await handleClubBannerPost(request, env, url);
    else if (path === '/api/club/pending') response = await handleClubPending(request, env, url);
    else if (path === '/api/club/create' && request.method === 'POST') response = await handleClubCreate(request, env, url);
    else if (path === '/api/club/join') response = await handleClubJoin(request, env, url);
    else if (path === '/api/club/accept') response = await handleClubAccept(request, env, url);
    else if (path === '/api/club/reject') response = await handleClubReject(request, env, url);
    else if (path === '/api/club/kick') response = await handleClubKick(request, env, url);
    else if (path === '/api/club/promote') response = await handleClubPromote(request, env, url);
    else if (path === '/api/club/demote') response = await handleClubDemote(request, env, url);
    else if (path === '/api/club/leave') response = await handleClubLeave(request, env, url);
    else if (path === '/api/club/edit' && request.method === 'POST') response = await handleClubEdit(request, env, url);

    // Mod routes
    else if (path.startsWith('/mod/') && path.endsWith('/dl/') === false) {
      const parts = path.split('/');
      const modId = parts[2];
      if (parts[4] === 'dl') {
        const dlId = parts[5];
        response = await handleModDlRedirect(request, env, url, modId, dlId);
      } else {
        response = await handleModDetails(request, env, url, modId);
      }
    }
    else if (path === '/api/mod/submit' && request.method === 'POST') response = await handleModSubmit(request, env, url);
    else if (path === '/api/mod/edit' && request.method === 'POST') response = await handleModEdit(request, env, url);
    else if (path === '/api/mod/delete' && request.method === 'POST') response = await handleModDelete(request, env, url);
    else if (path === '/api/mod/fav' && request.method === 'POST') response = await handleModFav(request, env, url);
    else if (path === '/api/mod/dl/submit' && request.method === 'POST') response = await handleModDlSubmit(request, env, url);
    else if (path === '/api/mod/dl/delete' && request.method === 'POST') response = await handleModDlDelete(request, env, url);
    else if (path === '/api/mod/dl/edit' && request.method === 'POST') response = await handleModDlEdit(request, env, url);

    // Admin routes
    else if (path === '/api/admin/user/ips') response = await handleAdminUserIps(request, env, url);
    else if (path === '/api/admin/user/data') response = await handleAdminUserData(request, env, url);
    else if (path === '/api/admin/user/set/email') response = await handleAdminUserSetEmail(request, env, url);
    else if (path === '/api/admin/user/delete') response = await handleAdminUserDelete(request, env, url);
    else if (path === '/api/admin/club/delete') response = await handleAdminClubDelete(request, env, url);
    else if (path === '/api/admin/club/updatefp') response = await handleAdminClubUpdatefp(request, env, url);
    else if (path === '/api/admin/user/ban') response = await handleAdminUserBan(request, env, url);
    else if (path === '/api/admin/user/warn') response = await handleAdminUserWarn(request, env, url);
    else if (path === '/api/admin/user/warn/delete') response = await handleAdminUserWarnDelete(request, env, url);
    else if (path === '/api/admin/user/warn/list') response = await handleAdminUserWarnList(request, env, url);
    else if (path === '/api/admin/score/delete') response = await handleAdminScoreDelete(request, env, url);
    else if (path === '/api/admin/players') response = await handleAdminPlayers(request, env, url);
    else if (path === '/api/admin/reloadconfig') response = await handleAdminReloadconfig(request, env, url);
    else if (path === '/api/admin/user/grant') response = await handleAdminUserGrant(request, env, url);
    else if (path === '/api/admin/user/notify') response = await handleAdminUserNotify(request, env, url);
    else if (path === '/api/admin/user/rename') response = await handleAdminUserRename(request, env, url);
    else if (path === '/api/admin/report/list') response = await handleAdminReportList(request, env, url);
    else if (path === '/api/admin/report/content') response = await handleAdminReportContent(request, env, url);
    else if (path === '/api/admin/report/delete') response = await handleAdminReportDelete(request, env, url);
    else if (path === '/api/admin/logs' && !path.includes('/process')) response = await handleAdminLogs(request, env, url);
    else if (path === '/api/admin/logs/process') response = await handleAdminLogsProcess(request, env, url);
    else if (path === '/api/admin/cooldown/clear') response = await handleAdminCooldownClear(request, env, url);
    else if (path === '/api/admin/endweekly') response = await handleAdminEndweekly(request, env, url);
    else if (path === '/api/admin/updateweekly') response = await handleAdminUpdateweekly(request, env, url);
    else if (path === '/api/admin/song/submit' && request.method === 'POST') response = await handleAdminSongSubmit(request, env, url);

    // Redirects (deprecated URLs)
    else if (path.startsWith('/network/user')) {
      return Response.redirect(url.origin + path.substring('/network'.length), 302);
    }
    else if (path.startsWith('/api/avatar')) {
      return Response.redirect('https://funkin.sniro.boo/api/user' + path.substring('/api'.length), 302);
    }
    else if (path.startsWith('/api/background')) {
      return Response.redirect('/api/user' + path.substring('/api'.length), 302);
    }
    else if (path === '/api/account/cookie') {
      return Response.redirect('/api/auth/cookie' + url.search, 302);
    }
    else if (path === '/api/account/logout') {
      return Response.redirect('/api/auth/logout', 302);
    }
    else {
      return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
    }

    // Add CORS headers to all responses
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      response.headers.set(key, value);
    }
    return response;
  } catch (exc) {
    console.error('Route error:', exc);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
}
