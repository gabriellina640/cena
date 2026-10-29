#!/usr/bin/env python3
"""Import a dated TMDB catalogue. Standard library only; credentials stay in memory."""
import argparse,concurrent.futures,csv,datetime,getpass,gzip,io,json,math,os,re,sqlite3,threading,time,unicodedata,urllib.request,urllib.parse,urllib.error,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
GENRES={'Action':28,'Adventure':12,'Animation':16,'Comedy':35,'Crime':80,'Documentary':99,'Drama':18,'Family':10751,'Fantasy':14,'History':36,'Horror':27,'Music':10402,'Mystery':9648,'Romance':10749,'Science Fiction':878,'TV Movie':10770,'Thriller':53,'War':10752,'Western':37}
IDS=list(GENRES.values())
def packed(x):return json.dumps(x,ensure_ascii=False,separators=(',',':'),allow_nan=False)
def fold(x):return ''.join(c for c in unicodedata.normalize('NFD',x) if not unicodedata.combining(c)).lower()
def num(x):
 try:
  n=float(x);return n if math.isfinite(n) else 0
 except (ValueError,TypeError):return 0
def img(x):return x if isinstance(x,str) and re.fullmatch(r'/[A-Za-z0-9_.-]{1,159}',x) else None
def movie(r,api=False):
 g=(r.get('genre_ids') or [x['id'] for x in r.get('genres',[])]) if api else [GENRES[x.strip()] for x in r.get('genres','').split(',') if x.strip() in GENRES]
 y=int(r['release_date'][:4]) if re.match(r'^\d{4}',r.get('release_date') or '') else 0
 m={'id':int(r['id']),'type':'movie','title':str(r.get('title') or r.get('original_title') or 'Título não informado')[:300],'originalTitle':str(r.get('original_title') or '')[:300],'year':min(y,2200),'genres':g[:30],'overview':str(r.get('overview') or 'Sinopse não disponível.')[:15000],'poster':img(r.get('poster_path')),'backdrop':img(r.get('backdrop_path')),'score':max(0,min(10,num(r.get('vote_average')))),'popularity':max(0,num(r.get('popularity'))),'providers':[],'availabilityKnown':False,'source':'tmdb'}
 runtime=int(num(r.get('runtime')))
 if 0<runtime<=20000:m['runtime']=runtime
 return m
def download(url,p):
 if p.exists() and p.stat().st_size:return
 temp=p.with_suffix(p.suffix+'.tmp')
 with urllib.request.urlopen(url,timeout=90) as response,temp.open('wb') as out:
  while chunk:=response.read(2*1024*1024):out.write(chunk)
 temp.replace(p)
def main():
 p=argparse.ArgumentParser();p.add_argument('--date',default=datetime.datetime.now(datetime.timezone.utc).date().isoformat());p.add_argument('--cache',default=str(ROOT/'outputs/import-cache'));p.add_argument('--no-token',action='store_true');args=p.parse_args()
 token='' if args.no_token else os.environ.get('TMDB_READ_TOKEN') or getpass.getpass('Token TMDB (entrada oculta): ').strip()
 date=datetime.date.fromisoformat(args.date);stamp=date.strftime('%m_%d_%Y');cache=Path(args.cache);cache.mkdir(parents=True,exist_ok=True)
 export=cache/f'movie_ids_{stamp}.json.gz';bulk=cache/'tmdb-dataset.zip'
 print('Baixando lista oficial de IDs e metadados públicos…',flush=True)
 download(f'https://files.tmdb.org/p/exports/movie_ids_{stamp}.json.gz',export)
 download('https://www.kaggle.com/api/v1/datasets/download/asaniczka/tmdb-movies-dataset-2023-930k-movies',bulk)
 db=sqlite3.connect(cache/'preparation.sqlite');db.executescript('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS ids(id INTEGER PRIMARY KEY,title TEXT,pop REAL); CREATE TABLE IF NOT EXISTS movies(id INTEGER PRIMARY KEY,data TEXT,search TEXT,year INTEGER,mask INTEGER,score REAL,pop REAL,bucket INTEGER,translated INTEGER DEFAULT 0,detailed INTEGER DEFAULT 1);')
 batch=[]
 with gzip.open(export,'rt',encoding='utf-8') as f:
  for line in f:
   r=json.loads(line)
   if r.get('adult'):continue
   batch.append((r['id'],r.get('original_title',''),r.get('popularity',0)))
   if len(batch)==10000:db.executemany('INSERT OR REPLACE INTO ids VALUES(?,?,?)',batch);batch=[]
 if batch:db.executemany('INSERT OR REPLACE INTO ids VALUES(?,?,?)',batch)
 db.commit();allowed={r[0] for r in db.execute('SELECT id FROM ids')}
 def insert(m,translated=0,detailed=1):
  mask=sum(1<<IDS.index(g) for g in set(m['genres']) if g in IDS)
  db.execute('INSERT OR REPLACE INTO movies VALUES(?,?,?,?,?,?,?,?,?,?)',(m['id'],packed(m),fold(m['title']+' '+m.get('originalTitle','')),m['year'],mask,m['score'],m['popularity'],m['id']%512,translated,detailed))
 count=0;csv.field_size_limit(10_000_000)
 with zipfile.ZipFile(bulk) as z:
  with z.open(next(n for n in z.namelist() if n.endswith('.csv'))) as f:
   for r in csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig')):
    try:identifier=int(r['id'])
    except (ValueError,KeyError):continue
    if identifier not in allowed:continue
    insert(movie(r));count+=1
    if count%200000==0:db.commit();print(f'{count:,} registros preparados.',flush=True)
 db.commit();missing=db.execute('SELECT ids.id,ids.title,ids.pop FROM ids LEFT JOIN movies ON movies.id=ids.id WHERE movies.id IS NULL').fetchall();print(f'IDs oficiais: {len(allowed):,}. Registros ausentes: {len(missing):,}.',flush=True)
 lock=threading.Lock();last=[0.0];failures=[]
 def request(path,params=None):
  url='https://api.themoviedb.org/3/'+path+'?'+urllib.parse.urlencode({'language':'pt-BR',**(params or {})})
  for attempt in range(5):
   with lock:time.sleep(max(0,0.08-(time.monotonic()-last[0])));last[0]=time.monotonic()
   try:
    with urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer '+token,'Accept':'application/json'}),timeout=40) as response:return json.load(response)
   except urllib.error.HTTPError as e:
    if e.code==404:return None
    if e.code in (401,403):raise RuntimeError('O TMDB recusou o token.') from None
    if e.code!=429 and e.code<500:raise RuntimeError(f'O TMDB retornou HTTP {e.code}.') from None
    time.sleep(max(2,num(e.headers.get('Retry-After')))*(attempt+1))
   except (OSError,TimeoutError):time.sleep(1.5*(attempt+1))
  raise RuntimeError('Falha de conexão com o TMDB após cinco tentativas.')
 if token and missing:
  def detail(row):return row,request(f'movie/{row[0]}')
  with concurrent.futures.ThreadPoolExecutor(max_workers=48) as pool:
   for i,(row,raw) in enumerate(pool.map(detail,missing),1):
    if raw:insert(movie(raw,True),1)
    else:failures.append(row[0])
    if i%100==0:db.commit();print(f'{i}/{len(missing)} registros ausentes consultados.',flush=True)
  db.commit()
 if token:
  queries=[(sort,page) for sort in ['popularity.desc','vote_count.desc'] for page in range(1,401)]
  def translated(q):return request('discover/movie',{'include_adult':'false','include_video':'true','sort_by':q[0],'page':q[1]})
  with concurrent.futures.ThreadPoolExecutor(max_workers=48) as pool:
   for i,data in enumerate(pool.map(translated,queries),1):
    for raw in (data or {}).get('results',[]):
     if raw.get('id') in allowed:insert(movie(raw,True),1)
    if i%100==0:db.commit();print(f'{i}/{len(queries)} páginas em português consultadas.',flush=True)
  db.commit()
 for identifier,title,pop in db.execute('SELECT ids.id,ids.title,ids.pop FROM ids LEFT JOIN movies ON movies.id=ids.id WHERE movies.id IS NULL').fetchall():insert(movie({'id':identifier,'title':title,'popularity':pop}),detailed=0)
 db.commit();db.execute('UPDATE movies SET pop=COALESCE((SELECT ids.pop FROM ids WHERE ids.id=movies.id),0)');db.execute('CREATE INDEX IF NOT EXISTS movies_bucket_idx ON movies(bucket,id)');db.commit()
 out=ROOT/'data/catalogo';(out/'filmes').mkdir(parents=True,exist_ok=True);bucket=-1;stream=None;sep=''
 for identifier,data,current in db.execute('SELECT id,data,bucket FROM movies ORDER BY bucket,id'):
  if current!=bucket:
   if stream:stream.write('}');stream.close()
   bucket=current;stream=gzip.open(out/'filmes'/f'{bucket:03}.json.gz','wt',encoding='utf-8',compresslevel=6);stream.write('{');sep=''
  stream.write(sep+packed(str(identifier))+':'+data);sep=','
 if stream:stream.write('}');stream.close()
 with gzip.open(out/'indice.json.gz','wt',encoding='utf-8',compresslevel=6) as f:
  f.write('[');sep=''
  for row in db.execute('SELECT id,search,year,mask,score,pop,bucket FROM movies ORDER BY pop DESC,id'):f.write(sep+packed(row));sep=','
  f.write(']')
 for name,order in [('recent','year DESC,pop DESC,id'),('rating','score DESC,pop DESC,id')]:
  with gzip.open(out/f'{name}.json.gz','wt',encoding='utf-8',compresslevel=6) as f:
   f.write('[');sep=''
   for row in db.execute('SELECT id FROM movies ORDER BY '+order):f.write(sep+str(row[0]));sep=','
   f.write(']')
 total,detailed,translations,known=db.execute('SELECT COUNT(*),SUM(detailed),SUM(translated),SUM(mask!=0) FROM movies').fetchone();assert total==len(allowed)
 meta={'version':1,'source':'tmdb','importedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exportDate':date.isoformat(),'total':total,'expectedTotal':len(allowed),'completeIds':True,'detailedTotal':detailed,'translatedTotal':translations,'genresKnownTotal':known,'unresolvedIds':failures,'genreIds':IDS,'sources':[{'name':'TMDB Daily ID Export','url':f'https://files.tmdb.org/p/exports/movie_ids_{stamp}.json.gz'},{'name':'Asaniczka · TMDB Movies Dataset','url':'https://www.kaggle.com/datasets/asaniczka/tmdb-movies-dataset-2023-930k-movies','license':'ODC-By'},{'name':'TMDB API · português','url':'https://developer.themoviedb.org/'}]}
 (out/'manifest.json').write_text(packed(meta)+'\n',encoding='utf-8');print(packed({'concluido':True,'total':total,'com_metadados':detailed,'consultados_em_portugues':translations,'com_generos':known,'bytes':sum(p.stat().st_size for p in out.rglob('*') if p.is_file())}),flush=True);db.close()
if __name__=='__main__':
 try:main()
 except KeyboardInterrupt:print('Importação interrompida; a preparação foi mantida.');raise SystemExit(1)
 except Exception as e:print('Falha na importação: '+str(e) if isinstance(e,(RuntimeError,ValueError)) else 'Falha na importação ('+type(e).__name__+').');raise SystemExit(1)
