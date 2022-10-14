import { Link, useLocation } from "react-router-dom";
import CardanoLogo from "src/assets/cardanologo.svg";
import ErgoLogo from "src/assets/ergologo.svg";
import { PageRoute } from "src/entities/common.entities";
import useComponentVisible from "src/hooks/useComponentVisible";

const NETWORK_INFO = {
  cardano: {
    text: "Cardano",
    img: CardanoLogo,
    to: PageRoute.claimErgo,
    toImg: ErgoLogo,
    toText: "Ergo",
  },
  ergo: {
    text: "Ergo",
    img: ErgoLogo,
    to: PageRoute.claimCardano,
    toImg: CardanoLogo,
    toText: "Cardano",
  },
};

export default function BlockchainSelector() {
  const location = useLocation().pathname;
  const isOnCardano = location.includes("cardano");
  const isOnErgo = location.includes("ergo");

  const network = NETWORK_INFO[isOnCardano ? "cardano" : "ergo"];

  const { ref, visible, setVisible } = useComponentVisible(false);

  return !isOnCardano && !isOnErgo ? null : (
    <div className="w-32 relative" ref={ref}>
      <button
        className="background w-full rounded-lg px-5 py-2.5 flex items-center justify-center gap-2"
        onClick={() => setVisible(!visible)}
      >
        <img className="h-5" src={network.img}></img>
        {network.text}
      </button>
      {visible ? (
        <Link to={network.to} onClick={() => setVisible(false)}>
          <button className="absolute mt-2.5 w-full background rounded-lg px-5 py-2.5 flex items-center justify-center gap-2">
            <img className="h-5" src={network.toImg}></img>
            {network.toText}
          </button>
        </Link>
      ) : null}
    </div>
  );
}
