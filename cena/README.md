# Cena

Catálogo pessoal de filmes, com design rosa, salsichinha e pug, busca, gêneros, listas e controle de assistidos. Sem login. O catálogo já está incluído no código; não precisa cadastrar a chave do TMDB na Vercel.

## Publicar

1. Extraia o ZIP. Envie todo o conteúdo da pasta `cena` para a raiz de um repositório GitHub. Use Git ou GitHub Desktop para enviar os arquivos grandes do catálogo. O `package.json` precisa ficar na raiz.
2. Na Vercel, escolha **Add New → Project**, importe o repositório e mantenha **Next.js**, Node.js **22.x**, instalação `npm ci` e build `npm run build`. Clique em **Deploy**.
3. Para gravar as listas em um JSON permanente na Vercel: abra o projeto → **Storage → Create Database → Blob → Continue → Private**. Conecte ao projeto e faça **Redeploy**. A Vercel cria a variável `BLOB_READ_WRITE_TOKEN` automaticamente.

Depois do passo 3, o site mostra **Salvo na Vercel**. As listas e os assistidos ficam no arquivo privado `cena/listas.json`. Quem acessar o site usa e pode editar a mesma coleção, conforme solicitado. Não há contas de usuário.

Sem Blob, o site funciona e mostra **Neste navegador**: as listas ficam no `localStorage`, separadas por navegador e endereço. Em **Dados e catálogo**, há exportação e importação de backup. Se já usou o modo local, exporte as listas antes de conectar o Blob e importe o backup depois.

O armazenamento do projeto publicado na Vercel é de leitura. O Blob é o que permite manter o JSON alterável entre acessos e publicações. Não salve as listas em `/tmp` ou dentro do repositório em tempo de execução.

## Catálogo incluído

Consulte os números exatos em `data/catalogo/manifest.json`. Esta versão incorpora os **1.266.484 IDs** da exportação principal de filmes do TMDB de **29/10/2026**, abrangendo todos os gêneros. Não inclui séries nem o arquivo separado de conteúdo adulto.

Os IDs foram cruzados com o dataset público de metadados do TMDB mantido por **Asaniczka**, com os registros ausentes consultados pela API. Os filmes mais populares e mais votados também foram consultados em português. Alguns títulos e sinopses continuam em inglês ou no idioma original. Poucos IDs que não retornaram detalhes na API mantêm apenas os dados básicos da exportação; os totais estão no manifesto.

O catálogo é uma cópia dessa data. Lançamentos e alterações posteriores exigem uma nova importação. Isso não garante todo filme já produzido no mundo. Filmes sem gêneros cadastrados continuam acessíveis pela busca, mas não entram em um filtro de gênero específico.

O JSON está dividido e comprimido em `data/catalogo/`: os arquivos `.json.gz` são JSON em gzip. A aplicação descomprime os arquivos necessários no servidor e envia somente a página solicitada ao navegador. Os pôsteres carregam do servidor de imagens do TMDB e precisam de internet.

Popularidade e avaliação são dados do TMDB; não são contagens oficiais de visualizações dos streamings. Não há filtro de streaming.

## Rodar no computador

```sh
npm ci
npm run dev
```

Abra `http://localhost:3000`. Para produção local:

```sh
npm run build
npm start
```

O `.env` incluído está vazio. Só é necessário preenchê-lo com `BLOB_READ_WRITE_TOKEN` para testar o armazenamento compartilhado localmente. A variável nunca deve ser publicada no GitHub. Consulte `ENV_EXEMPLO.txt` se o sistema esconder arquivos que começam com ponto.

## Atualizar o catálogo futuramente

O site pronto não exige Python nem chave do TMDB. Apenas para refazer os arquivos de dados, instale Python 3 e execute:

```sh
python3 scripts/import-catalog.py
```

O script usa apenas a biblioteca padrão. Ele solicita o token de leitura com entrada oculta, usa o token somente em memória e limita a frequência das chamadas. A preparação temporária fica em `outputs/`, ignorada pelo Git. Depois da importação, publique novamente o código com `data/catalogo/` atualizado. O catálogo não é importado durante o build da Vercel.

## Verificação

```sh
npm test
npm run typecheck
npm run build
```

Os testes verificam busca, gêneros, paginação, status antes da paginação, persistência local, backup, alterações concorrentes no JSON e falhas de gravação. A integração com o Blob precisa ser ativada no seu projeto; nenhum Blob da sua conta foi criado durante a preparação deste ZIP.

Por incluir mais de um milhão de filmes, o pacote é grande. Use a integração GitHub da Vercel. Em um projeto antigo que informe limite de 250 MB para a função, habilite Fluid Compute e configure `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`, conforme a documentação da Vercel, antes de republicar. Projetos novos compatíveis já têm suporte a funções maiores.

## Fontes e créditos

- [TMDB Daily ID Exports](https://developer.themoviedb.org/docs/daily-id-exports).
- [Asaniczka — Full TMDB Movies Dataset](https://www.kaggle.com/datasets/asaniczka/tmdb-movies-dataset-2023-930k-movies), licença indicada pela fonte: ODC Attribution License (ODC-By).
- [TMDB API](https://developer.themoviedb.org/), para completar registros e consultar dados em português.
- [Vercel Blob privado](https://vercel.com/docs/vercel-blob/private-storage).

This product uses the TMDB API but is not endorsed or certified by TMDB.
