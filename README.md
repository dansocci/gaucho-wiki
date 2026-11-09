# Gaucho Origins — guia de receitas

Guia pessoal, sem conta e sem servidor. As receitas vêm de `data/gaucho-recipes.csv`. Região, com quem conseguir e local de fabricação ficam vazios até você preencher no próprio guia.

## Abrir no Mac

No Terminal:

```sh
cd ~/Projects/gaucho-origins
./iniciar.sh
```

Abra [http://localhost:8731](http://localhost:8731). Deixe essa janela aberta.

Não abra o `index.html` direto no Finder. O navegador bloqueia os dados quando o arquivo é aberto assim.

## Consultar no Android

Publique o repositório no GitHub Pages. O endereço fica `https`, o Chrome consegue instalar, e o guia abre no celular sem o Mac ligado.

No repositório: Settings → Pages → Branch `main`, pasta `/ (root)`. O endereço será `https://SEU-USUARIO.github.io/gaucho-origins/`.

No Chrome do celular, abra esse endereço e use **Instalar app** ou **Adicionar à tela inicial**. Para jogar ao lado: tela dividida e, no guia, **Compacto**.

No plano gratuito o site precisa ser público. Anotações feitas no aparelho não vão para o GitHub. Em **Dados**, exporte o JSON e importe no outro aparelho. Depois de mudar um CSV, envie o commit e abra o guia uma vez com internet para a cópia do celular atualizar.

## O que não flutua sobre o jogo

Este guia é uma página instalável. O Chrome não pode desenhar uma janela por cima de outro aplicativo. Um overlay de verdade exigiria um app Android nativo e a permissão do sistema “exibir sobre outros apps”. A alternativa daqui é a tela dividida com o modo compacto.

## Atualizar as receitas

Se você substituir o CSV ou os ícones, rode de novo:

```sh
python3 scripts/build_catalog.py
```

Isso não apaga as anotações salvas no navegador.
