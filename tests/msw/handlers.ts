import { http, HttpResponse } from 'msw'

const API = 'http://localhost:3001'

export const handlers = [
  http.post(`${API}/login`, () =>
    HttpResponse.json({ token: 'test-token' })
  ),

  http.post(`${API}/register`, () =>
    HttpResponse.json({})
  ),

  http.post(`${API}/forgot_password`, () =>
    HttpResponse.json({ message: 'Reset link sent.' })
  ),

  http.post(`${API}/reset_password`, () =>
    HttpResponse.json({})
  ),

  http.get(`${API}/linked_cd_keys`, () =>
    HttpResponse.json({ cd_keys: [{ public_cd_key: 'ABC-DM-KEY', dm: true }] })
  ),

  http.get(`${API}/account_uuid`, () =>
    HttpResponse.json({ uuid: 'test-uuid-1234' })
  ),

  http.get(`${API}/display_name`, () =>
    HttpResponse.json({ display_name: 'TestDM' })
  ),

  http.patch(`${API}/display_name`, () =>
    HttpResponse.json({ display_name: 'NewName' })
  ),

  http.get(`${API}/email`, () =>
    HttpResponse.json({ email: 'dm@example.com' })
  ),

  http.patch(`${API}/email`, () =>
    HttpResponse.json({})
  ),

  http.patch(`${API}/password`, () =>
    HttpResponse.json({})
  ),

  http.get(`${API}/online_players`, () =>
    HttpResponse.json([
      {
        public_cd_key: 'PLAYER-KEY-1',
        online_player_name: 'Adventurer',
        character_name: 'Thorin',
        ip_address: '10.0.0.1',
        logged_on_at: '2026-07-12 10:00:00',
      },
    ])
  ),

  http.get(`${API}/online_dms`, () => HttpResponse.json([])),

  http.get(`${API}/active_bans`, () =>
    HttpResponse.json([])
  ),

  http.get(`${API}/bans`, () =>
    HttpResponse.json([])
  ),

  http.get(`${API}/bans/:id`, () =>
    HttpResponse.json({ ban_id: 1, cd_keys: [], player_names: [], ip_addresses: [] })
  ),

  http.patch(`${API}/bans/:id`, () =>
    HttpResponse.json({})
  ),

  http.post(`${API}/bans`, () =>
    HttpResponse.json({})
  ),

  http.patch(`${API}/unban`, () =>
    HttpResponse.json({})
  ),

  http.delete(`${API}/expunge`, () =>
    HttpResponse.json({})
  ),

  http.get(`${API}/player_data`, () =>
    HttpResponse.json([])
  ),

  http.get(`${API}/player_sessions`, () =>
    HttpResponse.json([])
  ),

  http.post(`${API}/otp`, () =>
    HttpResponse.json({ otp: '123456' })
  ),

  http.delete(`${API}/linked_cd_keys`, () =>
    HttpResponse.json({})
  ),
]
