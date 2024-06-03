# Смарт-контракт на Sway для маркетплейса
=====================

### Создаем проект 
=====================

Устанавливаем необходимые инструменты Fuel с помощью скрипта, это установит forc, forc-client, forc-fmt, forc-lsp, forc-wallet, а также fuel-Core в ~/.fuelup/bin:

    curl https://install.fuel.network | sh

Устанавливаем кошелек Fuel в бразуере https://chromewebstore.google.com/detail/fuel-wallet/dldjpboieedgcmpkchcjcbijingjcgok
После настройки кошелька нажмите кнопку «Кран» в кошельке, чтобы получить токены тестовой сети.

>Убедитесь, что вы используете Node.js/npm версии 18.18.2 || ^ 20.0.0. Вы можете проверить свою версию Node.js с помощью команды node -v

Теперь переходим к созданию папки fuel-project и создания нового проекта на Sway под названием contract:

    mkdir fuel-project
    cd fuel-project
    forc new contract
    cd contract

Контракт SwayStore в вашем файле main.sw должен выглядеть следующим образом:

```ruby
/* ANCHOR: all */
// ANCHOR: contract
contract;
// ANCHOR_END: contract

// ANCHOR: import
use std::{
    auth::msg_sender,
    call_frames::msg_asset_id,
    context::{
        msg_amount,
        this_balance,
    },
    asset::transfer,
    hash::Hash,
};
// ANCHOR_END: import

// ANCHOR: struct
struct Item {
    id: u64,
    price: u64,
    owner: Identity,
    metadata: str[20],
    total_bought: u64,
}
// ANCHOR_END: struct

// ANCHOR: abi
abi SwayStore {
    // a function to list an item for sale
    // takes the price and metadata as args
    #[storage(read, write)]
    fn list_item(price: u64, metadata: str[20]);

    // a function to buy an item
    // takes the item id as the arg
    #[storage(read, write), payable]
    fn buy_item(item_id: u64);

    // a function to get a certain item
    #[storage(read)]
    fn get_item(item_id: u64) -> Item;

    // a function to set the contract owner
    #[storage(read, write)]
    fn initialize_owner() -> Identity;

    // a function to withdraw contract funds
    #[storage(read)]
    fn withdraw_funds();

    // return the number of items listed
    #[storage(read)]
    fn get_count() -> u64;
}
// ANCHOR_END: abi

// ANCHOR: storage
storage {
    // counter for total items listed
    item_counter: u64 = 0,

    // ANCHOR: storage_map
    // map of item IDs to Items
    item_map: StorageMap<u64, Item> = StorageMap {},
    // ANCHOR_END: storage_map

    // ANCHOR: storage_option
    // owner of the contract
    owner: Option<Identity> = Option::None,
    // ANCHOR_END: storage_option
}
// ANCHOR_END: storage

// ANCHOR: error_handling
enum InvalidError {
    IncorrectAssetId: AssetId,
    NotEnoughTokens: u64,
    OnlyOwner: Identity,
}
// ANCHOR_END: error_handling

impl SwayStore for Contract {
    // ANCHOR: list_item_parent
    #[storage(read, write)]
    fn list_item(price: u64, metadata: str[20]) {
        
        // ANCHOR: list_item_increment
        // increment the item counter
        storage.item_counter.write(storage.item_counter.try_read().unwrap() + 1);
        // ANCHOR_END: list_item_increment
        
        // ANCHOR: list_item_sender
        // get the message sender
        let sender = msg_sender().unwrap();
        // ANCHOR_END: list_item_sender
        
        // ANCHOR: list_item_new_item
        // configure the item
        let new_item: Item = Item {
            id: storage.item_counter.try_read().unwrap(),
            price: price,
            owner: sender,
            metadata: metadata,
            total_bought: 0,
        };
        // ANCHOR_END: list_item_new_item

        // ANCHOR: list_item_insert
        // save the new item to storage using the counter value
        storage.item_map.insert(storage.item_counter.try_read().unwrap(), new_item);
        // ANCHOR_END: list_item_insert
    }
    // ANCHOR_END: list_item_parent

    // ANCHOR: buy_item_parent
    #[storage(read, write), payable]
    fn buy_item(item_id: u64) {
        // get the asset id for the asset sent
        // ANCHOR: buy_item_asset
        let asset_id = msg_asset_id();
        // ANCHOR_END: buy_item_asset

        // require that the correct asset was sent
        // ANCHOR: buy_item_require_not_base
        require(asset_id == AssetId::base(), InvalidError::IncorrectAssetId(asset_id));
        // ANCHOR_END: buy_item_require_not_base

        // get the amount of coins sent
        // ANCHOR: buy_item_msg_amount
        let amount = msg_amount();
        // ANCHOR_END: buy_item_msg_amount

        // get the item to buy
        // ANCHOR: buy_item_get_item
        let mut item = storage.item_map.get(item_id).try_read().unwrap();
        // ANCHOR_END: buy_item_get_item

        // require that the amount is at least the price of the item
        // ANCHOR: buy_item_require_ge_amount
        require(amount >= item.price, InvalidError::NotEnoughTokens(amount));
        // ANCHOR_END: buy_item_require_ge_amount

        // ANCHOR: buy_item_require_update_storage
        // update the total amount bought
        item.total_bought += 1;

        // update the item in the storage map
        storage.item_map.insert(item_id, item);
        // ANCHOR_END: buy_item_require_update_storage

        // ANCHOR: buy_item_require_transferring_payment
        // only charge commission if price is more than 0.1 ETH
        if amount > 100_000_000 {
            // keep a 5% commission
            let commission = amount / 20;
            let new_amount = amount - commission;
            // send the payout minus commission to the seller
            transfer(item.owner, asset_id, new_amount);
        } else {
            // send the full payout to the seller
            transfer(item.owner, asset_id, amount);
        }
        // ANCHOR_END: buy_item_require_transferring_payment
    }
    // ANCHOR_END: buy_item_parent

    // ANCHOR: get_item
    #[storage(read)]
    fn get_item(item_id: u64) -> Item {
        // returns the item for the given item_id
        return storage.item_map.get(item_id).try_read().unwrap();
    }
    // ANCHOR_END: get_item

    // ANCHOR: initialize_owner_parent
    #[storage(read, write)]
    fn initialize_owner() -> Identity {
        // ANCHOR: initialize_owner_get_owner
        let owner = storage.owner.try_read().unwrap();
        
        // make sure the owner has NOT already been initialized
        require(owner.is_none(), "owner already initialized");
        // ANCHOR_END: initialize_owner_get_owner
        
        // ANCHOR: initialize_owner_set_owner
        // get the identity of the sender        
        let sender = msg_sender().unwrap(); 

        // set the owner to the sender's identity
        storage.owner.write(Option::Some(sender));
        // ANCHOR_END: initialize_owner_set_owner
        
        // ANCHOR: initialize_owner_return_owner
        // return the owner
        return sender;
        // ANCHOR_END: initialize_owner_return_owner
    }
    // ANCHOR_END: initialize_owner_parent

    // ANCHOR: withdraw_funds_parent
    #[storage(read)]
    fn withdraw_funds() {
        // ANCHOR: withdraw_funds_set_owner
        let owner = storage.owner.try_read().unwrap();

        // make sure the owner has been initialized
        require(owner.is_some(), "owner not initialized");
        // ANCHOR_END: withdraw_funds_set_owner
        
        // ANCHOR: withdraw_funds_require_owner
        let sender = msg_sender().unwrap(); 

        // require the sender to be the owner
        require(sender == owner.unwrap(), InvalidError::OnlyOwner(sender));
        // ANCHOR_END: withdraw_funds_require_owner
        
        // ANCHOR: withdraw_funds_require_base_asset
        // get the current balance of this contract for the base asset
        let amount = this_balance(AssetId::base());

        // require the contract balance to be more than 0
        require(amount > 0, InvalidError::NotEnoughTokens(amount));
        // ANCHOR_END: withdraw_funds_require_base_asset
        
        // ANCHOR: withdraw_funds_transfer_owner
        // send the amount to the owner
        transfer(owner.unwrap(), AssetId::base(), amount);
        // ANCHOR_END: withdraw_funds_transfer_owner
    }
    // ANCHOR_END: withdraw_funds_parent

    // ANCHOR: get_count_parent
    #[storage(read)]
    fn get_count() -> u64 {
        return storage.item_counter.try_read().unwrap();
    }
    // ANCHOR_END: get_count_parent
}
/* ANCHOR_END: all */
```

Чтобы отформатировать и скомпилировать контракт, выполните команды:

    forc fmt
    forc build

### Разворачиваем и тестируем контракт
=====================

    forc deploy --testnet

После развертывания контракта вы сможете найти идентификатор своего контракта в папке Contract/out/deployments. Это понадобится вам для интеграции интерфейса.

Устанавливаем cargo generate и создаем шаблон:

    cargo install cargo-generate --locked
    cargo generate --init fuellabs/sway templates/sway-test-rs --name sway-store

>Откройте файл Cargo.toml и проверьте версию fuel, используемого в зависимости от разработки. Измените версию на 0.62.0, если это еще не так.

В папке test ваш файл harness.rs должен выглядеть так:

```ruby
// ANCHOR: rs_import
use fuels::{prelude::*, types::{Identity, SizedAsciiString}};
// ANCHOR_END: rs_import

// ANCHOR: rs_abi
// Load abi from json
abigen!(Contract(name="SwayStore", abi="out/debug/contract-abi.json"));
// ANCHOR_END: rs_abi

// ANCHOR: rs_contract_instance_parent
async fn get_contract_instance() -> (SwayStore<WalletUnlocked>, ContractId, Vec<WalletUnlocked>) {
    // Launch a local network and deploy the contract
    let wallets = launch_custom_provider_and_get_wallets(
        WalletsConfig::new(
            Some(3),             /* Three wallets */
            Some(1),             /* Single coin (UTXO) */
            Some(1_000_000_000), /* Amount per coin */
        ),
        None,
        None,
    )
    .await
    .unwrap();

    let wallet = wallets.get(0).unwrap().clone();
    
    // ANCHOR: rs_contract_instance_config
    let id = Contract::load_from(
        "./out/debug/contract.bin",
        LoadConfiguration::default(),
    )
    .unwrap()
    .deploy(&wallet, TxPolicies::default())
    .await
    .unwrap();
    // ANCHOR_END: rs_contract_instance_config

    let instance = SwayStore::new(id.clone(), wallet);

    (instance, id.into(), wallets)
}
// ANCHOR_END: rs_contract_instance_parent

// ANCHOR: rs_test_set_owner
#[tokio::test]
async fn can_set_owner() {
    let (instance, _id, wallets) = get_contract_instance().await;

    // get access to a test wallet
    let wallet_1 = wallets.get(0).unwrap();

    // initialize wallet_1 as the owner
    let owner_result = instance
        .with_account(wallet_1.clone())
        .methods()
        .initialize_owner()
        .call()
        .await
        .unwrap();

    // make sure the returned identity matches wallet_1
    assert!(Identity::Address(wallet_1.address().into()) == owner_result.value);
}
// ANCHOR_END: rs_test_set_owner

// ANCHOR: rs_test_set_owner_once
#[tokio::test]
#[should_panic]
async fn can_set_owner_only_once() {
    let (instance, _id, wallets) = get_contract_instance().await;

    // get access to some test wallets
    let wallet_1 = wallets.get(0).unwrap();
    let wallet_2 = wallets.get(1).unwrap();

    // initialize wallet_1 as the owner
    let _owner_result = instance.clone()
        .with_account(wallet_1.clone())
        .methods()
        .initialize_owner()
        .call()
        .await
        .unwrap();

    // this should fail
    // try to set the owner from wallet_2
    let _fail_owner_result = instance.clone()
        .with_account(wallet_2.clone())
        .methods()
        .initialize_owner()
        .call()
        .await
        .unwrap();
}
// ANCHOR_END: rs_test_set_owner_once

// ANCHOR: rs_test_list_and_buy_item
#[tokio::test]
async fn can_list_and_buy_item() {
    let (instance, _id, wallets) = get_contract_instance().await;
    // Now you have an instance of your contract you can use to test each function

    // get access to some test wallets
    let wallet_1 = wallets.get(0).unwrap();
    let wallet_2 = wallets.get(1).unwrap();

    // item 1 params
    let item_1_metadata: SizedAsciiString<20> = "metadata__url__here_"
        .try_into()
        .expect("Should have succeeded");
    let item_1_price: u64 = 15;

    // list item 1 from wallet_1
    let _item_1_result = instance.clone()
        .with_account(wallet_1.clone())
        .methods()
        .list_item(item_1_price, item_1_metadata)
        .call()
        .await
        .unwrap();

    // call params to send the project price in the buy_item fn
    let call_params = CallParameters::default().with_amount(item_1_price);

    // buy item 1 from wallet_2
    let _item_1_purchase = instance.clone()
        .with_account(wallet_2.clone())
        .methods()
        .buy_item(1)
        .append_variable_outputs(1)
        .call_params(call_params)
        .unwrap()
        .call()
        .await
        .unwrap();

    // check the balances of wallet_1 and wallet_2
    let balance_1: u64 = wallet_1.get_asset_balance(&AssetId::zeroed()).await.unwrap();
    let balance_2: u64 = wallet_2.get_asset_balance(&AssetId::zeroed()).await.unwrap();

    // make sure the price was transferred from wallet_2 to wallet_1
    assert!(balance_1 == 1000000015);
    assert!(balance_2 == 999999985);

    let item_1 = instance.methods().get_item(1).call().await.unwrap();

    assert!(item_1.value.price == item_1_price);
    assert!(item_1.value.id == 1);
    assert!(item_1.value.total_bought == 1);
}
// ANCHOR_END: rs_test_list_and_buy_item

// ANCHOR: rs_test_withdraw_funds
#[tokio::test]
async fn can_withdraw_funds() {
    let (instance, _id, wallets) = get_contract_instance().await;
    // Now you have an instance of your contract you can use to test each function

    // get access to some test wallets
    let wallet_1 = wallets.get(0).unwrap();
    let wallet_2 = wallets.get(1).unwrap();
    let wallet_3 = wallets.get(2).unwrap();

    // initialize wallet_1 as the owner
    let owner_result = instance.clone()
        .with_account(wallet_1.clone())
        .methods()
        .initialize_owner()
        .call()
        .await
        .unwrap();

    // make sure the returned identity matches wallet_1
    assert!(Identity::Address(wallet_1.address().into()) == owner_result.value);

    // item 1 params
    let item_1_metadata: SizedAsciiString<20> = "metadata__url__here_"
        .try_into()
        .expect("Should have succeeded");
    let item_1_price: u64 = 150_000_000;

    // list item 1 from wallet_2
    let item_1_result = instance.clone()
        .with_account(wallet_2.clone())
        .methods()
        .list_item(item_1_price, item_1_metadata)
        .call()
        .await;
    assert!(item_1_result.is_ok());

    // make sure the item count increased
    let count = instance.clone()
        .methods()
        .get_count()
        .simulate()
        .await
        .unwrap();
    assert_eq!(count.value, 1);

    // call params to send the project price in the buy_item fn
    let call_params = CallParameters::default().with_amount(item_1_price);
    
    // buy item 1 from wallet_3
    let item_1_purchase = instance.clone()
        .with_account(wallet_3.clone())
        .methods()
        .buy_item(1)
        .append_variable_outputs(1)
        .call_params(call_params)
        .unwrap()
        .call()
        .await;
    assert!(item_1_purchase.is_ok());

     // make sure the item's total_bought count increased
     let listed_item = instance
     .methods()
     .get_item(1)
     .simulate()
     .await
     .unwrap();
 assert_eq!(listed_item.value.total_bought, 1);

    // withdraw the balance from the owner's wallet
    let withdraw = instance
        .with_account(wallet_1.clone())
        .methods()
        .withdraw_funds()
        .append_variable_outputs(1)
        .call()
        .await;
    assert!(withdraw.is_ok());

    // check the balances of wallet_1 and wallet_2
    let balance_1: u64 = wallet_1.get_asset_balance(&AssetId::zeroed()).await.unwrap();
    let balance_2: u64 = wallet_2.get_asset_balance(&AssetId::zeroed()).await.unwrap();
    let balance_3: u64 = wallet_3.get_asset_balance(&AssetId::zeroed()).await.unwrap();

    assert!(balance_1 == 1007500000);
    assert!(balance_2 == 1142500000);
    assert!(balance_3 == 850000000);
}
// ANCHOR_END: rs_test_withdraw_funds
```

Запускаем тест:

    cargo test
    cargo test -- --nocapture

    
### Создаем внешний интерфейс
=====================    

    npx create-react-app frontend --template typescript
    cd frontend
    npm install fuels @fuels/react @fuels/connectors @tanstack/react-query
    npx fuels init --contracts ../contract/ --output ./src/contracts
    npx fuels build

Если все верно, то вы увидите следующий результат:

```ruby
Building..
Building Sway programs using built-in 'forc' binary
Generating types..
🎉  Build completed successfully!
```

Затем откройте файл frontend/src/App.tsx и замените шаблонный код шаблоном ниже, предвариельно изменив CONTRACT_ID на идентификатор контракта, который вы развернули ранее:

```ruby
import { useState, useMemo } from "react";
// ANCHOR: fe_import_hooks
import { useConnectUI, useIsConnected, useWallet } from "@fuels/react";
// ANCHOR_END: fe_import_hooks
import { ContractAbi__factory } from "./contracts";
import AllItems from "./components/AllItems";
import ListItem from "./components/ListItem";
import "./App.css";

// ANCHOR: fe_contract_id
const CONTRACT_ID =
  "0x797d208d0104131c2ab1f1e09c4914c7aef5b699fb494be864a5c37057076921";
// ANCHOR_END: fe_contract_id

function App() {
  // ANCHOR_END: fe_app_template
  // ANCHOR: fe_state_active
  const [active, setActive] = useState<"all-items" | "list-item">("all-items");
  // ANCHOR_END: fe_state_active
  // ANCHOR: fe_call_hooks
  const { isConnected } = useIsConnected();
  const { connect, isConnecting } = useConnectUI();
  // ANCHOR: fe_wallet
  const { wallet } = useWallet();
  // ANCHOR_END: fe_wallet
  // ANCHOR_END: fe_call_hooks

  // ANCHOR: fe_use_memo
  const contract = useMemo(() => {
    if (wallet) {
      const contract = ContractAbi__factory.connect(CONTRACT_ID, wallet);
      return contract;
    }
    return null;
  }, [wallet]);
  // ANCHOR_END: fe_use_memo

  return (
    <div className="App">
      <header>
        <h1>Sway Marketplace</h1>
      </header>
      {/* // ANCHOR: fe_ui_state_active */}
      <nav>
        <ul>
          <li
            className={active === "all-items" ? "active-tab" : ""}
            onClick={() => setActive("all-items")}
          >
            See All Items
          </li>
          <li
            className={active === "list-item" ? "active-tab" : ""}
            onClick={() => setActive("list-item")}
          >
            List an Item
          </li>
        </ul>
      </nav>
      {/* // ANCHOR: fe_ui_state_active */}
      {/* // ANCHOR: fe_fuel_obj */}
      <div>
        {isConnected ? (
          <div>
            {active === "all-items" && <AllItems contract={contract} />}
            {active === "list-item" && <ListItem contract={contract} />}
          </div>
        ) : (
          <div>
            <button
              onClick={() => {
                connect();
              }}
            >
              {isConnecting ? "Connecting" : "Connect"}
            </button>
          </div>
        )}
      </div>
      {/* // ANCHOR_END: fe_fuel_obj */}
    </div>
  );
}

export default App;
```

Затем скопируйте и вставьте приведенный ниже код CSS в файл App.css, чтобы добавить простой стиль:

```ruby
.App {
  text-align: center;
}

nav > ul {
  list-style-type: none;
  display: flex;
  justify-content: center;
  gap: 1rem;
  padding-inline-start: 0;
}

nav > ul > li {
  cursor: pointer;
}

.form-control{
  text-align: left;
  font-size: 18px;
  display: flex;
  flex-direction: column;
  margin: 0 auto;
  max-width: 400px;
}

.form-control > input {
  margin-bottom: 1rem;
}

.form-control > button {
  cursor: pointer;
  background: #054a9f;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 10px 0;
  font-size: 20px;
}

.items-container{
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 2rem;
  margin: 1rem 0;
}

.item-card{
  box-shadow: 0px 0px 10px 2px rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  max-width: 300px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.active-tab{
  border-bottom: 4px solid #77b6d8;
}

button {
  cursor: pointer;
  background: #054a9f;
  border: none;
  border-radius: 12px;
  padding: 10px 20px;
  margin-top: 20px;
  font-size: 20px;
  color: white;
}
```


    

