"""Synthetic SQLite substitute for the D1 binding. No network, credentials or app DB access."""
import json, sqlite3, sys
conn = sqlite3.connect(':memory:')
conn.row_factory = sqlite3.Row
for line in sys.stdin:
    req = json.loads(line)
    try:
        if 'export' in req:
            result = '\n'.join(conn.iterdump())
        elif 'restore' in req:
            conn.close()
            conn = sqlite3.connect(':memory:')
            conn.row_factory = sqlite3.Row
            conn.executescript(req['restore'])
            conn.execute('PRAGMA foreign_keys=ON')
            if list(conn.execute('PRAGMA foreign_key_check')):
                raise ValueError('restored foreign keys invalid')
            result = None
        elif 'schema' in req:
            conn.executescript(req['schema']); result = None
        else:
            result=[]
            with conn:
                for q in req['queries']:
                    c=conn.execute(q['sql'],q.get('values',[]))
                    rows=[dict(r) for r in c.fetchall()]
                    result.append({'results':rows,'meta':{'changes':max(0,c.rowcount)},'success':True})
        print(json.dumps({'id':req['id'],'result':result}),flush=True)
    except Exception as e:
        conn.rollback()
        print(json.dumps({'id':req['id'],'error':str(e)}),flush=True)
